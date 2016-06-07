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
var now = new Date();


var count_seeds=0;
var old_seeds=0;
var new_seeds=0;

var retryNum=0;
var socket_num=0;
/*-----------init seed, reading setting--------------*/
var service1 = JSON.parse(fs.readFileSync('./service/google.setting'));
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
var serverip = service1['id_serverip'];
var serverport = service1['id_serverport'];
var serverkey = service1['serverkey'];
var again_time = service1['retryTime'];

var terms=new Array();
var search_term="";
var key_index=0;
var terms_index=0;

process.on('beforeExit',(code)=>{
    let date = new Date();
    if(count_seeds!=0&&count_seeds!=old_seeds){
        writeLog('./seeds/seedLog',"["+date+"] term:"+search_term+" count_seeds:"+count_seeds+" old seeds:"+old_seeds+" new seeds:"+new_seeds+"\n===\n",-1);
    }

    terms_index++;
    if(terms_index<terms.length){
        count_seeds=0;
        old_seeds=0;
        new_seeds=0;
        retryNum=0;
        search_term = terms[terms_index];
        getSeeds(terms[terms_index],1);
    }
    else{
        process.exit()
    }

});
/*
var job = new CronJob({
    cronTime:require_Interval,
    onTick:function(){
        requireSeed();
    },
    start:false,
    timeZone:'Asia/Taipei'
});
*/

var service = JSON.parse(fs.readFileSync('./service/url_manager'));
var tw_address_filename = service['tw_address'];
var search_terms_filename = service1['search_terms'];
ReadTWaddress(tw_address_filename,function(){
    ReadTerms(search_terms_filename,function(){
        getSeeds(terms[terms_index],index);
        search_term = terms[terms_index];
        //getSeedID("https://zh-tw.facebook.com/botlion/app_206541889369118");
    });

});

function getSeeds(term,current_index)
{
    socket_num++;
    var query = querystring.stringify({q:term});
    request({
        url:main+'?siteSearch='+target+'&key='+googlekey[key_index]['gkey']+'&cx='+cx+'&start='+current_index+'&'+query,
        timeout:10000
    },(err,res,body)=>{
        if(!err&&res.statusCode===200){
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
            console.log(q_nextPage[0]['startIndex']);
            if(q_nextPage[0]['startIndex']<101){
                setTimeout(()=>{
                    getSeeds(term,q_nextPage[0]['startIndex']);
                },require_Interval*1000);
            }

        } 
        else{
            var msg="";
            if(res){
                if(res.statusCode>=500&&res.statusCode<600){
                    console.log("retry code:"+res.statusCode);
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
                            key_index=0;
                        }
                        else{
                            console.log('Use next key...['+key_index+']');
                            setTimeout(function(){
                                getSeeds(term,current_index);
                            },5*1000);
                        }
                    }
                }
                msg = JSON.stringify(res,null,2);
            }
            else if(err){
                if(err.code.indexOf('TIMEDOUT')!=-1){
                    console.log('getSeeds:TIMEDOUT');
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
            if(typeof body==="undefined"){
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
                    console.log("retry code:"+res.statusCode);
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
        url:'http://'+serverip+':'+serverport+'/fbjob/'+serverkey+'/v1.0/insertseed/?'+temp_ids,
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
                    console.log("retry code:"+res.statusCode);
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
    let log_date = dateFormat(now,"yyyymmdd");
    fs.appendFile(dir+'.'+log_date,msg,(err)=>{
        if(err){
            console.log(err);
        }
        /*
        if(action==-1){
            process.exit();
        }
        */
    });
}
function ReadTerms(filename,fin){
    var options = {
        //encoding: 'utf8',
        skipEmptyLines:false
    }
    var lr = new LineByLineReader(filename,options);
    iconv.skipDecodeWarning = true;
    lr.on('error', function (err) {
        // 'err' contains error object
        console.log("error:"+err);
    });
    lr.on('line', function (line) {
        terms.push(line);
    });
    lr.on('end', function () {
        // All lines are read, file is closed now.
        fin("read search_terms done");
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
