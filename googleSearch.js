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

var count_index=0;
var count_seeds=0;
var old_seeds=0;
var new_seeds=0;

var limit=0;
var retryNum=0;
var socket_num=0;
/*-----------init seed, reading setting--------------*/
var service1 = JSON.parse(fs.readFileSync('./service/google_client.setting'));
var main = service1['main'];
var fbmain = service1['fbmain'];
var googlekey = service1['googlekey'];
var fbkey = service1['fbkey'];
var cx = service1['cx'];
var target = service1['site'];
var index = service1['start'];
var logDir = service1['log'];
var seedsDir = service1['seedsDir'];
var require_Interval = service1['require_Interval'];
var serverip = service1['termServerip'];
var serverport = service1['termServerport'];
var serverver = service1['termServerversion'];
var term_lan = service1['term_lan'];
var term_requireNum = service1['term_requireNum'];
var fetchlimit = service1['fetchlimit'];
var termKey = service1['termKey'];
var again_time = service1['retryTime'];
var fetchseedsInterval = service1['fetchseedsInterval'];

var serverKey = service1['serverKey'];
var urlServerport = service1['urlServerport'];


var tw_address_filename = service1['tw_address'];
var search_terms_filename = service1['search_terms'];

var caught_terms =  new Array();
var uncaught_terms =  new Array();

var search_term="";
var key_index=0;
process.on('beforeExit',(code)=>{
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
            writeLog('./seeds/seedLog',"["+date+"] term:"+search_term+" count_seeds:"+count_seeds+" old seeds:"+old_seeds+" new seeds:"+new_seeds+"\n===\n",0);
        }
        console.log('rest term num:'+uncaught_terms.length+' key_index:'+key_index+' googlekey.length:'+googlekey.length)
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
            count_seeds=0;
            old_seeds=0;
            new_seeds=0;
            retryNum=0;
            count_index=0;
            getTerms(term_requireNum);
        }
        else{
            key_index=0;
            count_seeds=0;
            old_seeds=0;
            new_seeds=0;
            retryNum=0;
            count_index=0;
            console.log('[1] limit:'+limit+' fetchlimit:'+fetchlimit);
            job.start()
            //process.exit()
        }
    });



});

var job = new CronJob({
    cronTime:fetchseedsInterval,
    onTick:function(){
        var now = new Date();
        console.log('['+now+'] getTerms start');
        getTerms(term_requireNum);
    },
    start:false,
    timeZone:'Asia/Taipei'
});



ReadTWaddress(tw_address_filename,function(){
    var now = new Date();
    console.log('['+now+'] getTerms start');
    getTerms(term_requireNum);
});


function getTerms(num)
{
    job.stop();
    request({
        url:'http://'+serverip+':'+serverport+'/fbjob/'+termKey+'/'+serverver+'/termbot/getTerms/'+term_lan+'?num='+num,
        timeout:10000
    },(err,res,body)=>{
        if(!err&&res.statusCode===200){
            if(body=="illegal request"){
                console.log("illegal request");
                process.exit(0);
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
                process.exit();
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
                    console.log('getTerms:TIMEDOUT');
                    setTimeout(function(){
                        getTerms(num);
                    },again_time*1000);
                    return;
                }
                msg = JSON.stringify(err,null,2);
            }
            let date = new Date();
            writeLog(logDir,"["+date+"]\n"+msg+'\n===\n',0);
        }
    });
}
function updateTerm(term,stat,fin)
{
    var query = querystring.stringify({term:term});
    request({
        url:'http://'+serverip+':'+serverport+'/fbjob/'+termKey+'/'+serverver+'/termbot/status/update?'+query+'||'+stat,
        timeout:10000
    },(err,res,body)=>{
        if(!err&&res.statusCode===200){
            if(body=="illegal request"){
                console.log("illegal request");
                process.exit(0);
            }
            if(body==""){
                console.log('updateTerm to ['+stat+'] false:'+term);
            }
            else{
                console.log('updateTerm to ['+stat+'] success:'+body)
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
            let date = new Date();
            writeLog(logDir,"["+date+"]\n"+msg+'\n===\n',0);
        }
    });
}
function getSeeds(term,current_index)
{
    console.log('Seed term:'+term)
    socket_num++;
    var query = querystring.stringify({q:term});
    request({
        url:main+'?siteSearch='+target+'&key='+googlekey[key_index]['gkey']+'&cx='+cx+'&start='+current_index+'&'+query,
        timeout:10000
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
            var q_nextPage = content['queries']['nextPage'];
            var q_items = content['items'];
            var seeds="";

            var i;
            for(i=0;i<q_items.length;i++){
                var seedname = S(q_items[i]['link']).between('facebook.com/','/').s;
                if(seedname==""||typeof seedname==="undefined"){
                    seedname = S(q_items[i]['link']).strip('https://www.facebook.com/').s;
                }

                if(seedname==""||typeof seedname==="undefined"){
                    writeLog("./logs/watch.err",q_items[i]['link'],0);
                }
                else{
                    getSeedID(seedname);
                }
                /*
                if(seeds==""){
                    seeds=seedname;
                }
                else{
                    seeds+=','+seedname;
                }
                */
            }
            //console.log('next page:'+JSON.stringify(q_nextPage));
            if(typeof q_nextPage==="undefined"&&q_request['count']!=10){
                //writeLog("./logs/watch.err",JSON.stringify(content,null,2),-1);
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
                    //console.log(info['error']['message']);
                    if(info['error']['message'].indexOf("Daily Limit Exceeded")!=-1){
                        key_index++;
                        if(key_index>=googlekey.length){
                            console.log('All keys be used...');

                        }
                        else{
                            //console.log('googlekey.length:'+googlekey.length);
                            console.log('Use next key...['+key_index+']');
                            //setTimeout(function(){
                                getSeeds(term,current_index);
                            //},5*1000);
                        }
                    }
                    else{
                        console.log(info['error']['message']);
                    }
                }
                msg = JSON.stringify(res,null,2);
            }
            else if(err){
                if(err.code.indexOf('TIMEDOUT')!=-1){
                    console.log('getSeeds:TIMEDOUT');
                    retryNum++;
                    setTimeout(function(){
                        getSeeds(term,current_index);
                    },again_time*1000);
                    return;
                }
                msg = JSON.stringify(err,null,2);
            }
            let date = new Date();
            writeLog(logDir,"["+date+"]\n"+msg+'\n===\n',0);
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

    request({
        url:fbmain+seeds+'?fields=id,name&access_token='+fbkey,
        //url:fbmain+'?ids='+seeds+'&fields=id,name&access_token='+fbkey,
        timeout:10000
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
                                let date = new Date()
                                writeLog(logDir,"["+date+"] "+content['error']['message']+'\n===\n',0);
                            }

                        }
                        else{
                            count_seeds +=1;
                            var result=content['id']+','+content['name'];
                            insertSeed(content['id'],content['name']);

                            /*
                               for(i=0;i<content.length;i++){
                               if(result==""){
                               result = content[i]['id']+','+content[i]['name'];
                               }
                               else{
                               result += '\n'+content[i]['id']+','+content[i]['name'];
                               }

                               }
                               */
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
                    console.log('getSeedID:TIMEDOUT');
                    retryNum++;   
                    setTimeout(function(){
                        getSeedID(seeds);
                    },again_time*1000);
                    return;
                }
                msg = JSON.stringify(err,null,2);
            }
            let date = new Date();
            writeLog(logDir,"["+date+"]\n"+msg+'\n===\n',0);
        }
    });
}

function insertSeed(id,name)
{
    var ids = id+":Taiwan";
    var temp_ids = querystring.stringify({ids:ids});
    request({
        url:'http://'+serverip+':'+urlServerport+'/fbjob/'+serverKey+'/v1.0/insertseed/?'+temp_ids,
        timeout: 10000
    },(err,res,body)=>{
        if(!err&&res.statusCode===200){
            if(body=="illegal request"){
                console.log("illegal request");
                process.exit(0);
            }
            else if(body==""){
                old_seeds++;   
            }
            else if(body=="full"){
                console.log("url map is full=>cronjob stop:"+body);
                process.exit(0);
            }
            else{
                new_seeds++;
                writeSeed2file(id);
            }
        } 
        else{
            var msg="";
            if(res){
                if(res.statusCode>=500&&res.statusCode<600){
                    console.log("[insertSeed] retry code:"+res.statusCode);
                    retryNum++;   
                    setTimeout(function(){
                        insertSeed(id,name);
                    },again_time*1000);
                    return;
                }
                msg = JSON.stringify(res,null,2);
            }
            else if(err){
                if(err.code.indexOf('TIMEDOUT')!=-1){
                    console.log('insertSeed:TIMEDOUT');
                    retryNum++;   
                    setTimeout(function(){
                        insertSeed(id,name);
                    },again_time*1000);
                    return;
                }
                msg = JSON.stringify(err,null,2);
            }
            let date = new Date();
            writeLog(logDir,"["+date+"]\n"+msg+'\n===\n',0);
        }
    });
}

function writeSeed2file(seeds)
{
    fs.appendFile(seedsDir,seeds+'\n',(err)=>{
        if(err){
            console.log(err);
        }
    });
}

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
        fin();
    });

}
