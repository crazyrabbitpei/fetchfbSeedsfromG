'use strict'
var CronJob = require('cron').CronJob;
var request = require('request');
var http = require('http');
var fs = require('graceful-fs');
var iconv = require('iconv-lite');
var cheerio = require("cheerio");
var S = require('string');
var he = require('he');
var querystring = require("querystring");
var dateFormat = require('dateformat');
var LineByLineReader = require('line-by-line');
var HashMap = require('hashmap');
var map_tw_address  = new HashMap();

const EventEmitter = require('events');
class MyEmitter extends EventEmitter {}

/*-----------init seed, reading setting--------------*/
var service1 = JSON.parse(fs.readFileSync('./service/seeds'));
var seed_service_name = service1['seed_service_name'];
var seed_service_version = service1['seed_service_version'];
var fields = service1['fields'];
var version = service1['version'];
var appid = service1['id'];
var yoyo = service1['yoyo'];
var id_serverip = service1['id_serverip'];
var id_serverport = service1['id_serverport'];
var key = service1['crawlerkey'];
var country = service1['country'];
var require_num = service1['require_num'];
var from_seedIndex = service1['from_seedIndex'];
var to_seedIndex = service1['to_seedIndex'];
var seed_require_Interval = service1['seed_require_Interval'];
var old_seed_limit = service1['old_seed_limit'];
var retryTime = service1['retryTime'];
var timeout_retryTime = service1['timeout_retryTime']
var retry_limit = service['retry_limit'];
var tw_address_filename = service1['tw_address'];
var seed_log = service1['seed_log'];
var err_filename = service1['err_filename'];
var deleteID_filename = service1['deleteID_filename'];
var migratedID_filename = service1['migratedID_filename'];
var seed_record = service1['seed_record'];
var group_filename = service1['group_filename'];

var jump_index=-1;
var old_check=0;
var retry_cnt=0;

const myEmitter = new MyEmitter();
myEmitter.on('requireSeed', () => {
    if(from_seedIndex>0||typeof from_seedIndex==='undefined'){
        if(jump_index==-1){
            jump_index=from_seedIndex+require_num;
        }
        else{
            jump_index=jump_index+require_num;
        }
    }
    if(to_seedIndex>0){
        if(jump_index<to_seedIndex){
            setTimeout(()=>{
                console.log('===jump_index:'+jump_index+'===');
                requireSeed(require_num,jump_index);
            },2*1000);
        }
        else{
            console.log('--seed bot end--');
        }
    }
    else{
        setTimeout(()=>{
            console.log('===jump_index:'+jump_index+'===');
            requireSeed(require_num,jump_index);
        },2*1000);
    }

});

requireSeed(require_num,from_seedIndex);

function requireSeed(num,from_index){
    request({
        uri:'http://'+id_serverip+':'+id_serverport+'/'+seed_service_name+'/'+key+'/'+seed_service_version+'/getseed/seedbot/'+country+'/?num='+num+'&from='+from_index,
        timeout: 10000
    },function(error, response, body){
        if(!error&&response.statusCode==200){
            console.log("get expand:["+body+"]");
            if(body=="none"){
                console.log("[requireSeed=>hash map is empty]");
                return;
            }
            else if(typeof body==="undefined"){
                console.log("[requireSeed=>body=undefined]");
                retry_cnt++;
                if(retry_cnt<retry_limit){
                    setTimeout(()=>{
                        requireSeed(num,from_index);
                    },retryTime*1000);
                    return;
                }

            }

            getSeed(body,appid+"|"+yoyo,function(result){
                if(result!="error"&&result!="none"){
                    insertSeed(result,function(stat,result,err_msg){//error,old,full,{id1,ids2...}
                        if(stat=='error'){
                            console.log('[insertSeed] error occur, see '+seed_log);           
                            writeLog(seed_log+'/'+country+'_'+err_filename,"--\n["+result+"] insertSeed:"+err_msg+"\n--",'append');
                        }
                        else if(stat=='full'||stat=='stop'){

                        }
                        else if(stat=='old'){
                            myEmitter.emit('requireSeed');       
                        }
                        else{
                            console.log("insert seed:"+stat);
                            myEmitter.emit('requireSeed');       
                        }
                    });
                }
                else{
                    if(result=='none'){
                        console.log('not have any seed in ['+body+']');
                    }
                    else if(result=='error'){
                        console.log('[getSeed] error occur, see '+seed_log);           
                    }
                    else{
                        console.log('unknown error:'+result);
                    }
                }
            });
        }
        else{
            if(error){
                console.log("[getSeed] error:"+error.code);
                if(error.code.indexOf('TIMEDOUT')!=-1){
                    retry_cnt++;
                    if(retry_cnt<retry_limit){
                        setTimeout(function(){
                            requireSeed(num,from_index);
                        },timeout_retryTime*1000);

                    }
                }
                else{
                    writeLog(seed_log+'/'+country+'_'+err_filename,"--\n[requireSeed] "+error+"\n--",'append');
                }
            }
            else{
                if(response.statusCode>=500&&response.statusCode<600){
                    console.log('retry [requireSeed]:'+response.statusCode);
                    retry_cnt++;
                    if(retry_cnt<retry_limit){
                        setTimeout(()=>{
                            requireSeed(num,from_index);
                        },retryTime*1000);

                    }
                }
                else{
                    console.log('[requireSeed]:'+response.statusCode);
                    writeLog(seed_log+'/'+country+'_'+err_filename,"--\n[requireSeed] "+JSON.stringify(response)+"\n--",'append');
                }
            }
        }

    });
}
function getSeed(groupid,token,fin){
    request({
        uri:"https://graph.facebook.com/"+version+"/likes/?ids="+groupid+"&access_token="+token+"&fields="+fields,
        timeout: 10000
    },function(error, response, body){
        var err_flag=0;
        var err_msg="";
        if(!error&&response.statusCode==200){
            try{
                var feeds = JSON.parse(body);
            }
            catch(e){
                err_flag=1;
                err_msg=e;
            }
            finally{
                if(err_flag==1){
                    console.log("getSeed:"+err_msg);
                    writeLog(seed_log+'/'+country+'_'+err_filename,"--\n["+groupid+"] getSeed:"+err_msg+"\n--",'append');
                    fin("error");
                }
                else{
                    var count_seeds=0;
                    updateidServer(groupid,"c");
                    var len = Object.keys(feeds).length;
                    var page_name="";
                    var dot_flag=0;
                    var i,j,k;
                    if(len==0){
                        fin("none");
                        return;
                    }

                    var ids="";
                    for(j=0;j<len;j++){
                        page_name = Object.keys(feeds)[j];
                        for(i=0;i<feeds[page_name]['data'].length;i++){
                            if(feeds[page_name]['data'][i]['is_community_page']===true||feeds[page_name]['data'][i]['is_community_page']=="true"){
                                writeLog(seed_log+'/'+country+'_'+deleteID_filename,feeds[page_name]['data'][i]['id'],'append');
                                deleteSeed(feeds[page_name]['data'][i]['id'],function(stat,result,err_msg){
                                    if(stat=='error'){
                                        writeLog(seed_log+'/'+country+'_'+err_filename,"--\n["+result+"] deleteSeed:"+err_msg+"\n--",'append');
                                    }
                                });
                                continue;
                            }
                            else{
                                var loca="Other",real_loca="";
                                if(typeof feeds[page_name]['data'][i]['location'] !=="undefined"){
                                    if(typeof feeds[page_name]['data'][i]['location']['country']!== "undefined"){
                                        loca = feeds[page_name]['data'][i]['location']['country'];

                                    }
                                    else if(typeof feeds[page_name]['data'][i]['location']['city']!=="undefined"){
                                        loca = feeds[page_name]['data'][i]['location']['city'];
                                    }
                                    else if(typeof feeds[page_name]['data'][i]['location']['street']!=="undefined"){
                                        loca = feeds[page_name]['data'][i]['location']['street'];
                                    }
                                }

                                real_loca=loca;

                                if(typeof feeds[page_name]['data'][i]['name']!=="undefined"){
                                    var ischt = feeds[page_name]['data'][i]['name'].match(/[\u4e00-\u9fa5]/ig);//this will include chs
                                    if(ischt!=null){
                                        loca="Taiwan";
                                    }
                                }

                                var ischt = loca.match(/[\u4e00-\u9fa5]/ig);
                                if(ischt!=null){
                                    loca="Taiwan";
                                }
                                else{
                                    var loca_temp = loca.replace(/[0-9]/g,"");
                                    loca_temp = loca_temp.replace("~","");
                                    loca_temp = loca_temp.replace(":","");
                                    loca_temp = loca_temp.replace(/ /g,"");
                                    var small_loca1 = S(loca_temp).left(3).s;
                                    var small_loca2 = S(loca_temp).left(2).s;
                                    if(map_tw_address.get(loca_temp)||map_tw_address.get(small_loca1)||map_tw_address.get(small_loca2)){
                                        loca='Taiwan';
                                    }
                                }

                                if(loca!='Taiwan'){
                                    loca='Other';
                                }


                                var info = feeds[page_name]['data'][i];
                                if(typeof info['insights']!=='undefined'){
                                    if(typeof info['insights']['data'][0]['values'][info['insights']['data'][0]['values'].length-1]['value']!=='undefined'){

                                        var value = parseInt(info['insights']['data'][0]['values'][info['insights']['data'][0]['values'].length-1]['value']['TW']);
                                        if(typeof value!=='undefined'){
                                            var total_likes=parseInt(info['likes']);
                                            var percent = value/total_likes;
                                            if(percent>0.5){
                                                loca='Taiwan';
                                            }

                                        }
                                    }
                                }

                                recordNewSeeds(loca,real_loca,feeds[page_name]['data'][i]);

                                count_seeds++;
                                if(ids==""){
                                    ids += feeds[page_name]['data'][i]['id'];
                                    ids+=":"+loca;
                                }
                                else{
                                    ids += "~"+feeds[page_name]['data'][i]['id'];
                                    ids+=":"+loca;
                                }
                            }

                        }

                    }
                    console.log('--Fecth expand seeds:'+count_seeds+'--');
                    fin(ids);
                }
            }
        }
        else{
            if(error){
                console.log("[getSeed] error:"+error.code);
                if(error.code.indexOf('TIMEDOUT')!=-1){
                    retry_cnt++;
                    if(retry_cnt<retry_limit){
                        setTimeout(function(){
                            getSeed(groupid,token,fin);
                        },timeout_retryTime*1000);
                    }
                }
                else{
                    writeLog(seed_log+'/'+country+'_'+err_filename,"--\n["+groupid+"] getSeed:"+error+"\n--",'append');
                    fin('error');
                }
            }
            else{
                if(response.statusCode>=500&&response.statusCode<600){
                    console.log('retry [getSeed]:'+response.statusCode);
                    retry_cnt++;
                    if(retry_cnt<retry_limit){
                        setTimeout(()=>{
                            getSeed(groupid,token,fin);
                        },retryTime*1000);
                    }
                }
                else{
                    if(typeof body!=='undefined'){
                        try{
                            var feeds = JSON.parse(body);
                        }
                        catch(e){
                            err_flag=1;
                            err_msg=e;
                        }
                        finally{
                            if(err_flag==1){
                                console.log("getSeed:"+err_msg);
                                writeLog(seed_log+'/'+country+'_'+err_filename,"--\n["+groupid+"] getSeed:"+err_msg+"\n--",'append');
                                fin("error");
                            }
                            else{
                                console.log("getSeed error:"+feeds['error']['message']);
                                if(feeds['error']['message']=="(#4) Application request limit reached"){
                                    console.log("Application request limit reached:"+graph_request);
                                    writeLog(seed_log+'/'+country+'_'+err_filename,groupid,'append');
                                    fin("error");
                                }
                                else if(feeds['error']['message'].indexOf("(#100)")!=-1){//is User or is built with fb, or is not fan page(may be applaction)
                                    writeLog(seed_log+'/'+country+'_'+deleteID_filename,groupid,'append');
                                    fin("error");
                                }
                                else if(feeds['error']['message'].indexOf("was migrated to page ID")!=-1){
                                    writeLog(seed_log+'/'+country+'_'+migratedID_filename,feeds['error']['message'],'append');
                                    var d_seed = S(feeds['error']['message']).between('Page ID ',' was').s;
                                    var n_seed = S(feeds['error']['message']).between('page ID ','.').s;
                                    var new_groupid = groupid.replace(d_seed,n_seed);
                                    getSeed(new_groupid,token,fin);

                                    deleteSeed(d_seed,function(stat,result,err_msg){
                                        if(stat=='error'){
                                            console.log('[deleteSeed] error occur, see '+seed_log);           
                                            writeLog(seed_log+'/'+country+'_'+err_filename,"--\n["+result+"] deleteSeed:"+err_msg+"\n--",'append');
                                            fin(stat);
                                        }
                                    });
                                    insertSeed(n_seed,function(stat,result,err_msg){//error,old,full,{id1,ids2...}
                                        if(stat=='error'){
                                            console.log('[insertSeed] error occur, see '+seed_log);           
                                            writeLog(seed_log+'/'+country+'_'+err_filename,"--\n["+result+"] insertSeed:"+err_msg+"\n--",'append');
                                            fin("error");
                                        }
                                        else if(stat=='full'||stat=='stop'){
                                            fin('error');
                                        }
                                        else if(stat=='old'){
                                        }
                                        else{
                                            console.log("insert seed:"+stat);
                                        }
                                    });

                                }
                                else{
                                    writeLog(seed_log+'/'+country+'_'+err_filename,"--\n["+groupid+"] getSeed:"+feeds['error']['message']+"\n--",'append');
                                    fin("error");
                                }

                            }
                        }

                    }
                    else{
                        console.log('[getSeed]:'+response.statusCode);
                        writeLog(seed_log+'/'+country+'_'+err_filename,"--\n["+groupid+"] getSeed:"+JSON.stringify(response)+"\n--",'append');
                        fin('error');
                    }
                }
            }
        }

    });
}
function updateidServer(ids,mark)
{
    var i,j,k
    var parts = ids.split(",")
    var ids_send="";
    for(i=0;i<parts.length;i++){
        if(parts[i]==""){continue;}
        if(ids_send!=""){
            ids_send+=","+parts[i]+":"+mark;
        }
        else{
            ids_send+=parts[i]+":"+mark;
        }
    }

    request({
        uri:'http://'+id_serverip+':'+id_serverport+'/'+seed_service_name+'/'+key+'/'+seed_service_version+'/seedbot/update/'+country+'/?ids='+ids_send,
        timeout: 10000
    },function(error, response, body){
        if(!error&&response.statusCode==200){
            //console.log("["+ids+"] updateidServer:"+body);
            if(body=="illegal request"){
                writeLog(seed_log+'/'+country+'_'+err_filename,"--\n["+ids+"] updateidServer:"+body+"\n--",'append');
            }
        }
        else{
            if(error){
                console.log("[updateidServer] error:"+error.code);
                if(error.code.indexOf('TIMEDOUT')!=-1){
                    retry_cnt++;
                    if(retry_cnt<retry_limit){
                        setTimeout(function(){
                            updateidServer(ids,mark);
                        },timeout_retryTime*1000);

                    }
                }
                else{
                    writeLog(seed_log+'/'+country+'_'+err_filename,"--\n["+ids+"] updateidServer:"+error+"\n--",'append');
                }
            }
            else{
                if(response.statusCode>=500&&response.statusCode<600){
                    console.log('retry [updateidServer]:'+response.statusCode);
                    retry_cnt++;
                    if(retry_cnt<retry_limit){
                        setTimeout(()=>{
                            updateidServer(ids,mark);
                        },retryTime*1000);

                    }
                }
                else{
                    console.log('[updateidServer]:'+response.statusCode);
                    writeLog(seed_log+'/'+country+'_'+err_filename,"--\n["+ids+"] updateidServer:"+response.statusCode+"\n--",'append');
                }
            }
        }
        

    });
}
function insertSeed(ids,fin){
    var temp_ids = querystring.stringify({ids:ids});
    //console.log(temp_ids);
    request({
        uri:'http://'+id_serverip+':'+id_serverport+'/'+seed_service_name+'/'+key+'/'+seed_service_version+'/insertseed/?'+temp_ids,
        timeout: 10000
    },function(error, response, body){
        var err_msg='';
        if(!error&&response.statusCode==200){
            if(body=="illegal request"){//url request error
                console.log("insertSeed:"+body);
                //writeLog(seed_log+'/'+country+'_'+err_filename,"--\n["+ids+"] insertSeed:"+body+"\n--",'append');
                err_msg=body;
                fin("error",ids,err_msg);
            }
            else if(body==""){//all already exist.
                old_check++;
                console.log("[all exist] old check:"+old_check);
                if(old_seed_limit<old_check){
                    console.log('reached old_seed_limit:'+old_seed_limit);
                    fin('stop',ids,'');
                }
                else{
                    fin('old',ids,'');
                }

            }
            else if(body=="full"){
                console.log("insertSeed:url map is full, can't insert any seeds.");
                writeLog(seed_log+'/'+country+'_'+err_filename,"--\n["+ids+"] insertSeed:"+body+"\n--",'append');
                fin("full",ids,'');
            }
            else{
                var parts=body.split(',');
                var seeds_len = parts.length;
                console.log('--Success insert seeds:'+seeds_len);
                fin('insert',body,'');
            }
        }
        else{
            if(error){
                console.log("[insertSeed] error:"+error.code);
                if(error.code.indexOf('TIMEDOUT')!=-1){
                    retry_cnt++;
                    if(retry_cnt<retry_limit){
                        setTimeout(function(){
                            insertSeed(ids,fin);
                        },timeout_retryTime*1000);

                    }
                }
                else{
                    //writeLog(seed_log+'/'+country+'_'+err_filename,"--\n["+ids+"] insertSeed:"+error+"\n--",'append');
                    err_msg=error;
                    fin('error',ids,err_msg);
                }
            }
            else{
                if(response.statusCode>=500&&response.statusCode<600){
                    console.log('retry [insertSeed]:'+response.statusCode);
                    retry_cnt++;
                    if(retry_cnt<retry_limit){
                        setTimeout(()=>{
                            insertSeed(ids,fin);
                        },retryTime*1000);

                    }
                }
                else{
                    console.log('[insertSeed]:'+response.statusCode);
                    err_msg=response.statusCode;
                    fin('error',ids,err_msg);
                }
            }
        }


    });
}



function deleteSeed(ids,fin){
    var temp_ids = querystring.stringify({ids:ids});
    request({
        uri:'http://'+id_serverip+':'+id_serverport+'/'+seed_service_name+'/'+key+'/'+seed_service_version+'/deleteseed/?'+temp_ids,
        timeout: 10000
    },function(error, response, body){
        var err_msg='';
        if(!error&&response.statusCode==200){
            if(body=="illegal request"){//url request error
                console.log("deleteSeed:"+body);
                //writeLog(seed_log+'/'+country+'_'+err_filename,"--\n["+ids+"] deleteSeed:"+body+"\n--",'append');
                err_msg=body;
                fin("error",ids,err_msg);
            }
            else{
                /*
                if(body==''){
                    console.log('delete seed fail:'+ids);
                }
                */
                fin('delete',body,'');
            }
        }
        else{
            if(error){
                console.log("[deleteSeed] error:"+error.code);
                if(error.code.indexOf('TIMEDOUT')!=-1){
                    retry_cnt++;
                    if(retry_cnt<retry_limit){
                        setTimeout(function(){
                            deleteSeed(ids,fin);
                        },timeout_retryTime*1000);

                    }
                }
                else{
                    err_msg=error;
                    //writeLog(seed_log+'/'+country+'_'+err_filename,"--\n["+ids+"] deleteSeed:"+error+"\n--",'append');
                    fin("error",ids,err_msg);
                }
            }
            else{
                if(response.statusCode>=500&&response.statusCode<600){
                    console.log('retry [deleteSeed]:'+response.statusCode);
                    retry_cnt++;
                    if(retry_cnt<retry_limit){
                        setTimeout(()=>{
                            deleteSeed(ids,fin);
                        },retryTime*1000);

                    }
                }
                else{
                    console.log('[deleteSeed]:'+response.statusCode);
                    //writeLog(seed_log+'/'+country+'_'+err_filename,"--\n["+ids+"] deleteSeed:"+response.statusCode+"\n--",'append');
                    fin("error",ids,err_msg);
                }
            }
        }
    });
}

function recordNewSeeds(loca,real_loca,info){
//function recordNewSeeds(country,id,name,loca,category,likes,talking_about_count,were_here_count,fin){
    var id = info['id'];
    var temp_ids = querystring.stringify({ids:id});
    request({
        //method:'POST',
        uri:'http://'+id_serverip+':'+id_serverport+'/'+seed_service_name+'/'+key+'/'+seed_service_version+'/urllist/seedbot/search/'+loca+'?'+temp_ids,
        //uri:'http://'+id_serverip+':'+id_serverport+'/'+seed_service_name+'/'+key+'/'+seed_service_version+'/insertseed/?ids='+ids,
        timeout: 10000
    },function(error, response, body){
        if(!error&&response.statusCode==200){
            if(body=="illegal request"){//url request error
                writeLog(seed_log+'/'+loca+'_'+err_filename,"--\n["+id+"] recordNewSeeds:"+body+"\n--",'append');
                console.log("recordNewSeeds:"+body);
            }
            else if(body=="must contains id"){
                writeLog(seed_log+'/'+loca+'_'+err_filename,"--\n["+id+"] recordNewSeeds:"+body+"\n--",'append');
                console.log("recordNewSeeds:"+body);
            }
            else{
                var parts = body.split(":");
                if(parts[1]==""||typeof parts[1]==="undefined"||parts[1]=="undefined"){//if the id is new , then record to group file
                    var record="";
                    if(typeof info['insights']==='undefined'){
                        console.log('insights error');
                        writeLog(seed_log+'/'+loca+'_'+err_filename,"--\n["+id+"] recordNewSeeds:\n"+JSON.stringify(info)+"\n--",'append');
                        record = "@"+
                            "\n@id:"+info['id']+
                                "\n@name:"+info['name']+
                                    "\n@location:"+real_loca+
                                        "\n@insights_name:"+
                                            "\n@insights_end_time:"+
                                                "\n@insights_values:"+
                                                    "\n@category:"+info['category']+
                                                        "\n@likes:"+info['likes']+
                                                            "\n@talking_about_count:"+info['talking_about_count']+
                                                                "\n@were_here_count:"+info['were_here_count'];

                                                                if(loca=='Taiwan'){
                                                                    writeRecord(seed_record+'/Asia_'+group_filename,record,'append');
                                                                }
                                                                else{
                                                                    writeRecord(seed_record+'/Other_'+group_filename,record,'append');
                                                                }
                    }
                    else{
                        var record="";
                        var i;
                        var insights_name = info['insights']['data'][0]['name'];
                        var insights_end_time = info['insights']['data'][0]['values'][info['insights']['data'][0]['values'].length-1]['end_time'];
                        var insights_values = info['insights']['data'][0]['values'][info['insights']['data'][0]['values'].length-1]['value']
                        var popular="";
                        if(typeof insights_values!=='undefined'){
                            var len = Object.keys(insights_values).length;
                            for(i=0;i<len;i++){
                                var key = Object.keys(insights_values)[i];

                                var value = info['insights']['data'][0]['values'][info['insights']['data'][0]['values'].length-1]['value'][key];
                                if(popular==""){
                                    popular=key+':'+value;
                                }
                                else{
                                    popular+=','+key+':'+value;
                                }
                            }
                            //console.log(popular);
                        }
                        else{
                            console.log('insights error');
                            writeLog(seed_log+'/'+loca+'_'+err_filename,"--\n["+id+"] recordNewSeeds:\n"+JSON.stringify(info)+"\n--",'append');
                        }

                        record = "@"+
                            "\n@id:"+info['id']+
                                "\n@name:"+info['name']+
                                    "\n@location:"+real_loca+
                                        "\n@insights_name:"+insights_name+
                                            "\n@insights_end_time:"+insights_end_time+
                                                "\n@insights_values:"+popular+
                                                    "\n@category:"+info['category']+
                                                        "\n@likes:"+info['likes']+
                                                            "\n@talking_about_count:"+info['talking_about_count']+
                                                                "\n@were_here_count:"+info['were_here_count'];

                                                                if(loca=='Taiwan'){
                                                                    writeRecord(seed_record+'/Asia_'+group_filename,record,'append');
                                                                }
                                                                else{
                                                                    writeRecord(seed_record+'/Other_'+group_filename,record,'append');
                                                                }

                    }
                }

            }
        }
        else{
            if(error){
                console.log("[recordNewSeeds] error:"+error.code);

                if(error.code.indexOf('TIMEDOUT')!=-1){
                    retry_cnt++;
                    if(retry_cnt<retry_limit){
                        setTimeout(function(){
                            recordNewSeeds(loca,real_loca,info);
                        },timeout_retryTime*1000);

                    }
                }
                else{
                    writeLog(seed_log+'/'+loca+'_'+err_filename,"--\n["+id+"] recordNewSeeds:"+error+"\n--",'append');
                }
            }
            else{
                if(response.statusCode>=500&&response.statusCode<600){
                    console.log('retry [recordNewSeeds]:'+response.statusCode);
                    retry_cnt++;
                    if(retry_cnt<retry_limit){
                        setTimeout(()=>{
                            recordNewSeeds(loca,real_loca,info);
                        },retryTime*1000);

                    }
                }
                else{
                    console.log('[recordNewSeeds]:'+response.statusCode);
                    writeLog(seed_log+'/'+loca+'_'+err_filename,"--\n["+id+"] recordNewSeeds:"+response.statusCode+"\n--",'append');
                }
            }
        }
    });
}
function ReadTWaddress(tw_address_filename,fin){
    var options = {
        //encoding: 'utf8',
        skipEmptyLines:false
    }
    var lr = new LineByLineReader(tw_address_filename,options);
    iconv.skipDecodeWarning = true;
    lr.on('error', function (err) {
        // 'err' contains error object
        console.log("error:"+err);
    });
    lr.on('line', function (line) {
        var t_county_en,t_block_en;
        /*file format*/
        /*
           100,臺北市中正區,Zhongzheng Dist.,Taipei City
           */
        var part = line.split(",");
        /*cut chinese county*/
        var county = part[1];
        var short_county_cht,county_cht,block_cht,block_cht_temp;
        if(S(county).length<=3){
            short_county_cht = county;
        }
        else{
            short_county_cht = S(county).left(2).s;
        }

        county_cht = S(county).left(3).s;
        block_cht_temp = county.split(county_cht);
        block_cht = block_cht_temp[1];

        /*cut english county*/
        var county_en = part[3];
        var short_county_en,county_en,block_en,county_en_temp;
        block_en = part[2];

        if(typeof county_en==="undefined"){
            county_en = part[2];
        }

        short_county_en = county_en;
        county_en_temp = county_en.split(" County");
        county_en_temp = county_en_temp[0].split(" City");

        if(typeof county_en_temp[0]!=="undefined"){
            short_county_en = county_en_temp[0];
        }

        /*record to map*/
        if(S(county).length>3){//if is special case => 290,釣魚台,Diaoyutai  then will not set to map
            map_tw_address.set(short_county_cht,short_county_en);
            map_tw_address.set(short_county_en,short_county_cht);
        }
        map_tw_address.set(county_cht,county_en);
        map_tw_address.set(county_en,county_cht);

        map_tw_address.set(block_cht,block_en);
        map_tw_address.set(block_en,block_cht);

        map_tw_address.set(county,block_en+", "+county_en);
        map_tw_address.set(block_en+", "+county_en,county);
    });
    lr.on('end', function () {
        // All lines are read, file is closed now.
        map_tw_address.set("台灣","Taiwan");
        map_tw_address.set("臺灣","Taiwan");
        map_tw_address.set("Taiwan","臺灣");
        console.log("read map_tw_address done");
        fin("read map_tw_address done");
    });

}
function writeLog(dir,msg,opt)
{
    var logdate = new Date();
    if(opt=='append'){
        fs.appendFile(dir,'['+logdate+'] '+msg+'\n',function(err){
            if(err){
                console.log(err);
            }
        });
    }
    else if(opt=='write'){
        fs.writeFile(dir,'['+logdate+'] '+msg+'\n',function(err){
            if(err){
                console.log(err);
            }
        });
    }
}

function writeRecord(dir,rec,opt)
{
    if(opt=='append'){
        fs.appendFile(dir,rec+'\n',function(err){
            if(err){
                console.log(err);
            }
        });
    }
    else if(opt=='write'){
        fs.writeFile(dir,rec+'\n',function(err){
            if(err){
                console.log(err);
            }
        });
    }
}

