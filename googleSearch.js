'use strict'
//TODO:確認log該記錄的都有記錄
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
var server = require('./tool/server.js')
var map_tw_address  = new HashMap();

var count_index=0;
var count_seeds=0;
var old_seeds=0;
var new_seeds=0;

var limit=0;
var retryNum=0;
var socket_num=0;
//TODO:要記得將setting資訊存起來，因為只要成功請求到botkey一次，就會永久記錄此key，所以之後就不會再跟bot_manager請求任何資訊，故需要儲存setting
/*-----------init seed, reading setting--------------*/
var service1 = JSON.parse(fs.readFileSync('./service/google_client.setting','utf8'));
var main = service1['main'];
var fbmain = service1['fbmain'];
var googlekey = service1['googlekey'];
var fbkey = service1['fbkey'];
var cx = service1['cx'];
var target = service1['site'];
var index = service1['start'];
var max_num = service1['num'];
var excludesite = service1['excludesite'];
var excludeterm = service1['excludeterm'];

var log = service1['log'];
var err_filename = service1['err_filename'];
var process_filename = service1['process_filename'];


var seedsDir = service1['seedsDir'];
var seeds_filename = service1['seeds_filename'];
var daily_filename = service1['daily_filename'];

var require_Interval = service1['require_Interval'];
var serverip = service1['term_serverip'];
var serverport = service1['term_serverport'];
var term_server_version = service1['term_server_version'];
var term_server_name = service1['term_server_name'];
var term_lan = service1['term_lan'];
var term_requireNum = service1['term_requireNum'];
var fetchlimit = service1['fetchlimit'];
var termKey = service1['termKey'];
var again_time = service1['retryTime'];
var fetchseedsInterval = service1['fetchseedsInterval'];
var serverKey = service1['serverKey'];

var bot_serverip = service1['bot_serverip'];
var bot_serverport = service1['bot_serverport'];
var bot_server_name = service1['bot_server_name'];
var bot_server_version = service1['bot_server_version'];
var invitekey = service1['invitekey'];
var google_botkey = service1['google_botkey'];

var id_serverip;
var id_serverport;
var id_server_name;
var id_server_version;
var limit_retry;
var timeout_retryTime;

exports.bot_serverip=bot_serverip;
exports.bot_serverport=bot_serverport;
exports.bot_server_name=bot_server_name;
exports.bot_server_version=bot_server_version;
exports.invitekey=invitekey;

var tw_address_filename = service1['tw_address'];
var search_terms_filename = service1['search_terms'];

var caught_terms =  new Array();
var uncaught_terms =  new Array();

var search_term="";

var key_index=0;


var botkey;
var setting;
process.on('beforeExit',(code)=>{
    console.log('==============now new seeds:'+new_seeds+'===============');
    let date = new Date();
    var stat="";
    if(count_index<101){
        stat='false';
    }
    else{
        stat='done';
    }
    updateTerm(search_term,stat,()=>{
        if(count_seeds!=0&&count_seeds!=old_seeds){
            writeLog(search_term+","+count_seeds+","+old_seeds+","+new_seeds,'daily','append',0);
        }
        console.log('rest term num:'+uncaught_terms.length+' key_index:'+key_index+' googlekey.length:'+googlekey.length)
        writeLog('rest term num:'+uncaught_terms.length+' key_index:'+key_index+' googlekey.length:'+googlekey.length,'process','append',0);
        search_term = uncaught_terms.pop();
        if(typeof search_term!=='undefined'&&key_index<googlekey.length){
            count_seeds=0;
            old_seeds=0;
            new_seeds=0;
            retryNum=0;
            count_index=0;
            getSeeds(search_term,index);
        }
        else if(uncaught_terms.length==0&&key_index<googlekey.length&&limit<fetchlimit){
            console.log('[0] limit:'+limit+' fetchlimit:'+fetchlimit);
            writeLog('[0] limit:'+limit+' fetchlimit:'+fetchlimit,'process','append',0);
            count_seeds=0;
            old_seeds=0;
            new_seeds=0;
            retryNum=0;
            count_index=0;
            getTerms(term_requireNum);
        }
        else{
            limit=0;
            key_index=0;
            count_seeds=0;
            old_seeds=0;
            new_seeds=0;
            retryNum=0;
            count_index=0;
            console.log('[1] limit:'+limit+' fetchlimit:'+fetchlimit);
            writeLog('[1] limit:'+limit+' fetchlimit:'+fetchlimit,'process','append',0);
            job.start()
        }
    });
});
var job = new CronJob({
    cronTime:fetchseedsInterval,
    onTick:function(){
        var now = new Date();
        console.log('['+now+'] getTerms start');
        writeLog('['+now+'] getTerms start','process','append',0);
        getTerms(term_requireNum);
    },
    start:false,
    timeZone:'Asia/Taipei'
});

var excludesite_term='';
var excludeterm_term='';
if(!module.parent){
    var i;
    var len=excludesite.length;
    console.log(excludesite.length);
    for(i=0;i<len;i++){
        excludesite_term+=' -site:'+excludesite[i]['site'];
        //excludesite_term+='+%2Dsite%3A'+excludesite[i]['site'];
    }
    len=excludeterm.length;
    for(i=0;i<len;i++){
        excludeterm_term+=' -'+excludeterm[i]['term'];
        //excludeterm_term+='+%2D'+excludeterm[i]['term'];
    }
    
    //console.log('excludesite_term:'+excludesite_term);
    //console.log('excludeterm_term:'+excludeterm_term);

    console.log('Start reading '+google_botkey+' ...');
    fs.readFile(google_botkey,'utf8',(err,data)=>{
        var err_flag=0;
        if(err){
            console.log('read botkey error:'+err);
            writeLog('read botkey error:'+err,'error','append',0);
            err_flag=1;
        }
        else{
            if(data!=''){
                console.log('Has ori setting!');
                var read_err_flag=0,err_msg='';
                try{
                    var ori_setting = JSON.parse(data);
                }
                catch(e){
                    err_msg=e;
                    read_err_flag=1;

                }
                finally{
                    if(read_err_flag==1){
                        writeLog('[getkey-get ori setting] error:'+e,'error','append',1);
                    }
                    else{
                        botkey=ori_setting['data']['bot_manager']['botkey'];
                        id_serverip=ori_setting['data']['bot_manager']['setting']['id_serverip'];
                        id_serverport=ori_setting['data']['bot_manager']['setting']['id_serverport'];
                        id_server_name=ori_setting['data']['bot_manager']['setting']['seed_server_name'];
                        id_server_version=ori_setting['data']['bot_manager']['setting']['seed_server_version'];
                        limit_retry=ori_setting['data']['bot_manager']['setting']['limit_retry'];
                        timeout_retryTime=ori_setting['data']['bot_manager']['setting']['timeout_retryTime'];
                        if(typeof id_serverip==='undefined'){
                            console.log(google_botkey+' formal error!!!');
                            process.exit(0);   
                        }
                        else{
                            console.log('==botkey exists==:'+botkey);
                        }

                    }
                }
            }
            else{
                console.log('Need to require a new setting from bot_manager!');
                err_flag=1;
            }
        }
        //要請求新的botkey，因為目前loca沒有記錄任何可用的botkey
        if(err_flag==1){
            getkey((stat,err_msg)=>{
                if(stat=='false'){
                    console.log('[getkey] err:'+err_msg);
                    writeLog('[getkey] err:'+err_msg,'error','append',1);
                }
                else if(stat=='ok'){
                    console.log('==get new botkey==:'+botkey);
                    ReadTWaddress(tw_address_filename,function(){
                        var now = new Date();
                        console.log('['+now+'] getTerms start');
                        getTerms(term_requireNum);
                    });
                }
            });
        }
        else{
            ReadTWaddress(tw_address_filename,function(){
                var now = new Date();
                console.log('['+now+'] getTerms start');
                writeLog('['+now+'] getTerms start','process','append',0);
                getTerms(term_requireNum);
            });
        }
    });
}


function getkey(fin){
    server.getBotkey('googlebot',(stat,result,err_msg)=>{
        if(stat=='ok'){
            var err_flag=0,err_msg='';
            try{
                var content = JSON.parse(result);
            }
            catch(e){
                err_flag=1;
                err_msg=e;
            }
            finally{
                if(err_flag==1){
                    fin('false',err_msg);
                }
                else if(err_flag==0){
                    if(content['status']=='false'){
                        console.log('[getBotkey] '+content['error']);
                        fin('false',content['error']);
                    }
                    else{
                        botkey = content['data']['bot_manager']['botkey'];
                        setting = content['data']['bot_manager']['setting'];
                        exports.botkey=botkey;
                        exports.setting=setting;
                        //url_manager
                        exports.id_serverip=setting.id_serverip;
                        exports.id_serverport=setting.id_serverport;
                        exports.id_server_name=setting.id_server_name;
                        exports.id_server_version=setting.id_server_version;

                        fs.writeFile(google_botkey,JSON.stringify(content,null,3),(err)=>{
                            if(err){
                                console.log('write new key to '+google_botkey+' err:'+err);
                                writeLog('write new key to '+google_botkey+' err:'+err,'error','append',1);
                            }
                            else{
                                console.log('Success update setting:\n'+JSON.stringify(content,null,3));
                                id_serverip=setting['id_serverip'];
                                id_serverport=setting['id_serverport'];
                                id_server_name=setting['seed_server_name'];
                                id_server_version=setting['seed_server_version'];
                                limit_retry=setting['limit_retry'];
                                timeout_retryTime=setting['timeout_retryTime'];

                                fin('ok','')
                            }
                        });
                    }
                }
            }
        }
        else{
            fin('false',err_msg);
        }
    });
}

function getTerms(num)
{
    job.stop();
    request({
        url:'http://'+serverip+':'+serverport+'/'+term_server_name+'/'+termKey+'/'+term_server_version+'/getTerms/'+term_lan+'?num='+num,
        timeout:60000
    },(err,res,body)=>{
        if(!err&&res.statusCode===200){
            if(body=="illegal request"){
                console.log("illegal request");
                writeLog('illegal request','error','append',1);
            }
            if(body!=""){
                var parts = body.split('||');
                var i;
                limit+=parts.length;
                for(i=0;i<parts.length;i++){
                    uncaught_terms.push(parts[i]);
                }
                search_term = uncaught_terms.pop();
                getSeeds(search_term,index);
            }
            else{
                console.log('no any term in termsServer array!');
                writeLog('no any term in termsServer array!','error','append',1);
            }
        } 
        else{
            var msg="";
            if(res){
                if(res.statusCode>=500&&res.statusCode<600){
                    console.log("[getTerms] retry code:"+res.statusCode);
                    setTimeout(function(){
                        getTerms(num);
                    },again_time*1000);
                    return;
                }
                msg = JSON.stringify(res,null,2);
            }
            else if(err){
                if(err.code.indexOf('TIMEDOUT')!=-1){
                    console.log('getTerms:'+err.code);
                    setTimeout(function(){
                        getTerms(num);
                    },again_time*1000);
                    return;
                }
                msg = JSON.stringify(err,null,2);
            }
            writeLog(msg,'error','append',0);
        }
    });
}
function updateTerm(term,stat,fin)
{
    var query = querystring.stringify({term:term});
    request({
        url:'http://'+serverip+':'+serverport+'/'+term_server_name+'/'+termKey+'/'+term_server_version+'/status/update?'+query+'||'+stat,
        timeout:60000
    },(err,res,body)=>{
        if(!err&&res.statusCode===200){
            if(body=="illegal request"){
                console.log("illegal request");
                writeLog('illegal request','error','append',1);
            }
            if(body==""){
                console.log('updateTerm '+stat+' false:'+term);
                writeLog('updateTerm '+stat+' false:'+term,'process','append',0);
            }
            else{
                console.log('updateTerm '+stat+' success:'+body)
                writeLog('updateTerm '+stat+' success:'+body,'process','append',0);
            }
            fin();
        } 
        else{
            var msg="";
            if(res){
                if(res.statusCode>=500&&res.statusCode<600){
                    console.log("[updateTerm] retry code:"+res.statusCode);
                    setTimeout(function(){
                        updateTerm(term,stat)
                    },5*1000);
                    return;
                }
                msg = JSON.stringify(res,null,2);
            }
            else if(err){
                if(err.code.indexOf('TIMEDOUT')!=-1||err.code.indexOf('ECONNRESET')!=-1){
                    console.log('updateTerm:'+err.code);
                    setTimeout(function(){
                        updateTerm(term,stat)
                    },5*1000);
                    return;
                }
                msg = JSON.stringify(err,null,2);
            }
            writeLog(msg,'error','append',0);
        }
    });
}
function getSeeds(term,current_index)
{
    console.log('Seed term:'+term+excludesite_term+excludeterm_term)
    socket_num++;
    var query = querystring.stringify({q:term+excludesite_term+excludeterm_term});
    request({
        url:main+'?siteSearch='+target+'&key='+googlekey[key_index]['gkey']+'&cx='+cx+'&start='+current_index+'&'+query+'&num='+max_num,
        timeout:60000
    },(err,res,body)=>{
        if(!err&&res.statusCode===200){
            if(typeof body==="undefined"||body==""){
                console.log("body null");
                retryNum++;
                setTimeout(function(){
                    getSeeds(term,current_index);
                },again_time*1000);
                return;
            }
            var content = JSON.parse(body);
            var q_request = content['queries']['request'];
            var q_num = content['queries']['totalResults'];
            var q_nextPage = content['queries']['nextPage'];
            var q_items = content['items'];
            fs.appendFile('./demo1.list',JSON.stringify(body,null,2)+'\n\n',()=>{

            });
            fs.appendFile('./demo2.list',JSON.stringify(content,null,2)+'\n\n',()=>{

            });
            if(typeof q_items==='undefined'){
                writeLog('Can\'t get available seedname:\n'+body,'error','append',0);
                return;
            }

           //TODO:testing
            if(q_num=="0"||q_num==0){
                count_index=101;
            }
            else{
                var seeds="";
                var i;
                for(i=0;i<q_items.length;i++){
                    if(q_items[i]['link'].indexOf('profile')!=-1){
                        continue;
                    }

                    var seedname = S(q_items[i]['link']).between('facebook.com/','/').s;
                    if(seedname==""||typeof seedname==="undefined"){
                        seedname = S(q_items[i]['link']).strip('https://www.facebook.com/').s;
                        seedname = S(seedname).strip('https://zh-tw.facebook.com/').s;
                        seedname = S(seedname).strip('https://tw.facebook.com/').s;
                        seedname = S(seedname).strip('https://tw.facebook.com/').s;
                        seedname = S(seedname).strip('http://zh-tw.facebook.com/').s;
                        seedname = S(seedname).strip('jp.facebook.com/').s;

                        var another = seedname.split('?');
                        if(another.length>=2){
                            seedname=another[0];
                        }
                    }

                    if(seedname=='business'||seedname=='commerce'){
                        continue;
                    }
                    if(seedname==""||typeof seedname==="undefined"){
                        writeLog('Can\'t get available seedname:'+q_items[i]['link'],'error','append',0);
                    }
                    else{
                        getSeedID(seedname);
                    }
                }
                //console.log('next page:'+JSON.stringify(q_nextPage));
                if(typeof q_nextPage==="undefined"&&q_request['count']!=10){
                    writeLog('Can\'t get available seedname:'+JSON.stringify(content,null,2),'error','append',0);
                    count_index=101;
                }
                else if(typeof q_nextPage==="undefined"&&q_request['count']==10){
                    console.log("q_nextPage retry");
                    retryNum++;
                    setTimeout(function(){
                        getSeeds(term,current_index);
                    },again_time*1000);
                    return;
                }
                else{
                    console.log(q_nextPage[0]['startIndex']);
                    count_index = q_nextPage[0]['startIndex'];
                    if(q_nextPage[0]['startIndex']<101){
                        setTimeout(()=>{
                            getSeeds(term,q_nextPage[0]['startIndex']);
                        },require_Interval*1000);
                    }
                }
            }

        } 
        else{

            var msg="";
            if(res){
                if(res.statusCode>=500&&res.statusCode<600){
                    console.log("[getSeeds] retry code:"+res.statusCode);
                    retryNum++;
                    setTimeout(function(){
                        getSeeds(term,current_index);
                    },again_time*1000);
                    return;
                }
                else if(res['body']){
                    let info = JSON.parse(res['body']);
                    if(info['error']['message'].indexOf("Daily Limit Exceeded")!=-1||info['error']['message'].indexOf('billing')!=-1){
                        writeLog(info['error']['message'],'process','append',0);
                        key_index++;
                        if(key_index>=googlekey.length){
                            console.log('All keys be used...');
                            writeLog('All keys be used...','process','append',0);
                        }
                        else{
                            //console.log('googlekey.length:'+googlekey.length);
                            console.log('Use next key...['+key_index+']');
                            writeLog('Use next key...['+key_index+']','process','append',0);
                            getSeeds(term,current_index);
                        }
                    }
                    else{
                        console.log(info['error']['message']);
                        writeLog(info['error']['message'],'error','append',1);
                    }
                }
                msg = JSON.stringify(res,null,2);
            }
            else if(err){
                if(err.code.indexOf('TIMEDOUT')!=-1){
                    console.log('getSeeds:'+err.code);
                    retryNum++;
                    setTimeout(function(){
                        getSeeds(term,current_index);
                    },again_time*1000);
                    return;
                }
                msg = JSON.stringify(err,null,2);
            }
            writeLog(msg,'error','append',0);
        }
    });
}

function getSeedID(seeds)
{
    if(seeds.indexOf("-")!=-1){
        var id = seeds.split("-");
        seeds = id[id.length-1];
    }
    console.log("seeds:"+seeds);
    fs.appendFile('./seed.list',seeds+'\n',()=>{});
    request({
        url:fbmain+seeds+'?fields=id,name&access_token='+fbkey,
        //url:fbmain+'?ids='+seeds+'&fields=id,name&access_token='+fbkey,
        timeout:60000
    },(err,res,body)=>{
        if(!err&&res.statusCode===200){
            if(typeof body==="undefined"||body==""){
                console.log("body null");
                retryNum++;
                setTimeout(function(){
                    getSeedID(seeds);
                },again_time*1000);
            }
            else{
                var err_flag=0;
                try{
                    var content = JSON.parse(body);
                }
                catch(e){
                    err_flag=1;
                }
                finally{
                    if(err_flag==1){
                        err_flag=0;
                        retryNum++;
                        setTimeout(function(){
                            getSeedID(seeds);
                        },again_time*1000);
                    }
                    else{
                        if(typeof content ==="undefined"){
                            retryNum++;
                            setTimeout(function(){
                                getSeedID(seeds);
                            },again_time*1000);
                        }
                        else if(content['error']){
                            if(content['error']['message'].indexOf("retry")!=-1||content['error']['message'].indexOf("unexpected error")!=-1||content['error']['message'].indexOf("unknown error")!=-1){
                                retryNum++;
                                setTimeout(function(){
                                    getSeedID(seeds);
                                },again_time*1000);
                            }
                            else{
                                writeLog(content['error']['message'],'error','append',0);
                            }

                        }
                        else{
                            count_seeds +=1;
                            var result=content['id']+','+content['name'];
                            insertSeed(content['id'],content['name'],(stat,err_msg)=>{
                                if(stat=='error'){
                                    console.log('[insertSeed] '+stat+':'+err_msg)
                                    if(err_msg.indexOf('illegal api-key')!=-1){//因為gogolebotkey只存留在bot_manager的memory，所以可能因為server重啟，所以key被刷掉，需要重新申請新的設定檔
                                        writeLog('[insertSeed] '+stat+':'+err_msg,'error','append',0);
                                        getkey((stat,err_msg)=>{
                                            if(stat=='false'){
                                                console.log('[getkey-re] err:'+err_msg);
                                                writeLog('[getkey-re] err:'+err_msg,'error','append',1);
                                            }
                                            else if(stat=='ok'){
                                                console.log('==get new botkey==:'+botkey);
                                                insertSeed(content['id'],content['name'],(stat,err_msg)=>{
                                                    if(stat=='error'){
                                                        writeLog('[insertSeed-re] '+stat+':'+err_msg,'error','append',1);
                                                    }
                                                    else if(stat=='full'||stat=='stop'){
                                                        console.log('[insertSeed-re] '+stat+':'+err_msg)
                                                        writeLog('[insertSeed-re] '+stat+':'+err_msg,'error','append',1);
                                                    }
                                                });
                                            }
                                        });
                                    }
                                    else{
                                        writeLog('[insertSeed] '+stat+':'+err_msg,'error','append',1);
                                    }
                                }
                                else if(stat=='full'||stat=='stop'){
                                    console.log('[insertSeed] '+stat+':'+err_msg)
                                    writeLog('[insertSeed] '+stat+':'+err_msg,'error','append',1);
                                }
                            });
                        }
                    }
                }

            }
        } 
        else{
            var msg="";
            if(res){
                if(res.statusCode>=500&&res.statusCode<600){
                    console.log("[getSeedID] retry code:"+res.statusCode);
                    retryNum++;   
                    setTimeout(function(){
                        getSeedID(seeds);
                    },again_time*1000);
                    return;
                }
                msg = JSON.stringify(res,null,2);
            }
            else if(err){
                if(err.code.indexOf('TIMEDOUT')!=-1){
                    console.log('getSeedID:'+err.code);
                    retryNum++;   
                    setTimeout(function(){
                        getSeedID(seeds);
                    },again_time*1000);
                    return;
                }
                msg = JSON.stringify(err,null,2);
            }
            writeLog(msg,'error','append',0);
        }
    });
}
//TODO:可一次新增多個
function insertSeed(id,name,fin){
    var ids = id+":Asia";
    var temp_ids = querystring.stringify({ids:ids});
    //console.log(temp_ids);
    request({
        uri:'http://'+id_serverip+':'+id_serverport+'/'+id_server_name+'/'+botkey+'/'+id_server_version+'/insertseed/?'+temp_ids,
        timeout: 60000
    },function(error, response, body){
        var err_msg='',err_flag=0;
        if(!error&&response.statusCode==200){
            try{
                var result = JSON.parse(body);
            }
            catch(e){
                err_flag=1;
                err_msg=e;
            }
            finally{
                if(err_flag==1){
                    fin("error",err_msg);
                }
                else{
                    if(result['status']=='false'){
                        if(result['error']=='full'){
                            fin('full','insertSeed:url map is full, can\'t insert any seeds');
                        }
                        else{
                            fin("error",result['error']);
                        }
                    }
                    else{
                        if(result['data']['url_manager']['Asia']==0&&result['data']['url_manager']['Other']==0){
                            old_seeds++;   
                            fin('old','');
                        }
                        else{
                            new_seeds+=result['data']['url_manager']['Asia']+result['data']['url_manager']['Other'];
                            writeSeed2file(id);
                            fin('insert','');

                        }
                    }
                }

            }
        }
        else{
            if(error){
                console.log("[insertSeed] error:"+error.code);
                if(error.code.indexOf('TIMEDOUT')!=-1||error.code.indexOf('ECONNRESET')!=-1){
                    retryNum++;   
                    if(retryNum<limit_retry){
                        setTimeout(function(){
                            insertSeed(id,name,fin);
                        },timeout_retryTime*1000);

                    }
                }
                else{
                    fin('error',error.code);
                }
            }
            else{
                if(response.statusCode>=500&&response.statusCode<600){
                    console.log('retry [insertSeed]:'+response.statusCode);
                    retryNum++;   
                    if(retryNum<limit_retry){
                        setTimeout(()=>{
                            insertSeed(id,name,fin);
                        },again_time*1000);
                    }
                }
                else{
                    var err_msg=JSON.parse(response.body)['error'];
                    console.log('[insertSeed]:'+err_msg);
                    fin('error',err_msg);
                }
            }
        }


    });
}
function writeSeed2file(seeds)
{
    fs.appendFile(seedsDir+'/'+seeds_filename,seeds+'\n',(err)=>{
        if(err){
            console.log(err);
        }
    });
}
/*
function writeLog(dir,msg,action)
{
    var now = new Date();
    var log_date = dateFormat(now,"yyyymmdd");
    fs.appendFile(dir+'.'+log_date,msg,(err)=>{
        if(err){
            console.log(err);
        }
        if(action==-1){
            process.exit();
        }
    });
}
*/
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
        map_tw_address.set("Asia","亞洲");
        map_tw_address.set("亞洲","Asia");
        console.log("read map_tw_address done");
        fin();
    });

}
function writeLog(msg,type,opt,end)
{
    var now = dateFormat(new Date(),'yyyymmdd');
    var logdate = new Date();
    if(opt=='append'){
        if(type=='error'){
            fs.appendFile(log+'/'+now+err_filename,'['+logdate+'] '+msg+'\n',function(err){
                if(err){
                    console.log(err);
                }
                if(end==1){
                    process.exit(0);
                }
            });
        }
        else if(type=='process'){
            fs.appendFile(log+'/'+now+process_filename,'['+logdate+'] '+msg+'\n',function(err){
                if(err){
                    console.log(err);
                }
                if(end==1){
                    process.exit(0);
                }
            });
        }
        else if(type=='daily'){
            fs.appendFile(seedsDir+'/'+now+daily_filename,msg+'\n',function(err){
                if(err){
                    console.log(err);
                }
                if(end==1){
                    process.exit(0);
                }
            });
        }

    }
    else if(opt=='write'){
        if(type=='error'){
            fs.writeFile(log+'/'+now+err_filename,'['+logdate+'] '+msg+'\n',function(err){
                if(err){
                    console.log(err);
                }
                if(end==1){
                    process.exit(0);
                }
            });
        }
        else if(type=='process'){
            fs.writeFile(log+'/'+now+process_filename,'['+logdate+'] '+msg+'\n',function(err){
                if(err){
                    console.log(err);
                }
                if(end==1){
                    process.exit(0);
                }
            });
        }
        else if(type=='daily'){
            fs.writeFile(seedsDir+'/'+now+daily_filename,msg+'\n',function(err){
                if(err){
                    console.log(err);
                }
                if(end==1){
                    process.exit(0);
                }
            });
        }
    }
}
