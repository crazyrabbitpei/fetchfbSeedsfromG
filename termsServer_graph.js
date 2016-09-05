'use strict'
//TODO:可以存取googlebot目前狀況API(今日抓了多少新的seed、詞彙分別為何...目前資料會讓clien端存在loca，未來可能要定期回報)
var bodyParser = require('body-parser');
var urlencode = require('urlencode');
var LineByLineReader = require('line-by-line');
var iconv = require('iconv-lite');
var querystring = require("querystring");
var fs = require('graceful-fs');
var S = require('string');

var request = require('request');
var CronJob = require('cron').CronJob;

var express = require('express');
var app  = express();
var http = require('http');
var server = http.createServer(app);

var HashMap = require('hashmap');
var map_tw_address  = new HashMap();
var processing = new HashMap();

var caught_terms2file =  [];
var caught_terms2file_en =  [];

var caught_terms =  [];
var uncaught_terms =  [];
var caught_terms_en = [];
var uncaught_terms_en = [];

var now = new Date();

var count_seeds=0;
var old_seeds=0;
var new_seeds=0;

var currentr_uncaught_index_en=0;
var currentr_uncaught_index_noten=0;

var retryNum=0;
var socket_num=0;
/*-----------init seed, reading setting--------------*/
var service1 = JSON.parse(fs.readFileSync('./service/graph_termserver.setting'));

var apiip = service1['termServerip'];
var apiport = service1['termServerport'];
var server_name = service1['termServername'];
var writeidInterval =  service1['writeidInterval'];
var detectInterval =  service1['detectInterval'];
var expire_time =  service1['expire_time'];
var limit_requireTerm =  service1['limit_requireTerm'];
var perReadTermsNum = service1['perReadTermsNum'];
var termServerLog =  service1['termServerLog'];
var search_terms_filename = service1['search_terms'];
var termKey = service1['termKey'];
var tw_address_filename = service1['tw_address'];


var search_term="";
var key_index=0;
var terms_index=0;

//--read data--
var job = new CronJob({
    cronTime:writeidInterval,
    onTick:function(){
        console.log('Recording terms status...');
        writeTerms2file();
    },
    start:false,
    timeZone:'Asia/Taipei'
});

//--detect expire term --
var trace_term = new CronJob({
    cronTime:detectInterval,
    onTick:function(){
        detectExpireTerm();
        if(uncaught_terms.length<perReadTermsNum/2){
            var lan='not_en';
            ReadTerms('uncaught',lan,search_terms_filename,'',()=>{
            });
        }
    },
    start:false,
    timeZone:'Asia/Taipei'
});


//--server process--
process.on('SIGINT', function () {
    console.log("[Server stop] ["+new Date()+"] http stop at "+apiip+":"+apiport);
    job.stop();
    process.exit(0);

});
process.on('SIGTERM', function () {
    console.log("[Server stop] ["+new Date()+"] http stop at "+apiip+":"+apiport);
    job.stop();
    process.exit(0);
});

//----------------

ReadTerms('caught','not_en',search_terms_filename,'',()=>{
    ReadTerms('uncaught','not_en',search_terms_filename,'',()=>{
        console.log('[not_en] uncaught_terms:'+uncaught_terms.length+' caught_terms:'+caught_terms.length);
        server.listen(apiport,apiip,function(){
            console.log("[Server start] ["+new Date()+"] http work at "+apiip+":"+apiport);
        });
        trace_term.start();
        job.start();
    });
});



//----------------
function detectExpireTerm()
{
    var now = new Date();
    processing.forEach((value,key)=>{
        if(now.getTime()-expire_time*60*1000>new Date(value).getTime()){
        //if(now.getTime()-5*1000>new Date(value).getTime()){
            console.log("["+now+"]--key:"+key+" has expired--"+value);
            processing.remove(key);
            uncaught_terms.push(key);
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

function writeTerms2file()
{
    var i;
    var ct="",ct_en="";
    var index;
    
    for(i=0;i<caught_terms2file.length;i++){
        ct+=caught_terms2file[i]+'\n';
    }
    caught_terms2file=[];
    
    for(i=0;i<caught_terms2file_en.length;i++){
        ct_en+=caught_terms2file_en[i]+'\n';

    }
    caught_terms2file_en=[];
    if(ct!=""){
        fs.appendFile(search_terms_filename+'not_en/caught',ct,(err)=>{
            if(err){
                console.log(err);
            }
            else{
                console.log('[done] not_en/caught');
            }
        });
    }
    else{
        console.log('[done] not_en/caught');
    }

    if(ct_en!=""){
        fs.appendFile(search_terms_filename+'en/caught',ct_en,(err)=>{
            if(err){
                console.log(err);
            }
            else{
                console.log('[done] en/caught');
            }
        });
    }
    else{
        console.log('[done] en/caught');
    }
}
function writeLog(msg,action)
{
    let log_date = dateFormat(now,"yyyymmdd");
    fs.appendFile(termServerLog+'.'+log_date,msg,(err)=>{
        if(err){
            console.log(err);
        }
        if(action==-1){
            process.exit();
        }
    });
}
function ReadTerms(type,lan,filename,newf,fin){
    var index_cnt=0,to_index=0;
    var line_cnt=0;
    var dir;
    if(type=='uncaught'){
        if(lan=='en'){
            to_index = currentr_uncaught_index_en+perReadTermsNum;
            index_cnt = currentr_uncaught_index_en;
        }
        else if(lan=='not_en'){
            to_index = currentr_uncaught_index_noten+perReadTermsNum;
            index_cnt = currentr_uncaught_index_noten;
        }
    }

    var options = {
        //encoding: 'utf8',
        skipEmptyLines:false
    }

    if(newf==""){
        dir = filename+lan+'/'+type;
    }
    else{
        dir = filename+lan+'/'+newf;
    }
    console.log('Read ['+dir+']');
    var lr = new LineByLineReader(dir,options);
    iconv.skipDecodeWarning = true;
    lr.on('error', function (err) {
        // 'err' contains error object
        console.log("error:"+err);
    });
    lr.on('line', function (line) {
        if(type=='uncaught'){
            if(uncaught_terms.length==perReadTermsNum){
                console.log('reach:'+perReadTermsNum);
                lr.close();
            }
            else{
                var ischt = line.match(/[\u4e00-\u9fa5]/ig);
                if(ischt!=null){
                    lan="not_en";
                }
                else{
                    lan="en";
                }

                if(lan=="not_en"){
                    if(type=="uncaught"){
                        if(uncaught_terms.indexOf(line)==-1&&caught_terms.indexOf(line)==-1){
                            uncaught_terms.push(line);
                            //console.log('uncaught_terms.length:'+uncaught_terms.length);
                            //console.log('line cnt:'+line_cnt+' to_index:'+to_index);
                        }

                    }
                    else if(type=="caught"){
                        if(caught_terms.indexOf(line)==-1){
                            caught_terms.push(line);
                        }
                    }
                }
                else if(lan=="en"){
                    if(type=="uncaught"){
                        if(uncaught_terms_en.indexOf(line)==-1&&caught_terms_en.indexOf(line)==-1){
                            uncaught_terms_en.push(line);
                        }
                    }
                    else if(type=="caught"){
                        if(caught_terms_en.indexOf(line)==-1){
                            caught_terms_en.push(line);
                        }
                    }
                }
            }
        }
        else if(type=='caught'){
            if(lan=='not_en'){
                if(caught_terms.indexOf(line)==-1){
                    caught_terms.push(line);
                }
            }
            else if(lan=='en'){
                if(caught_terms_en.indexOf(line)==-1){
                    caught_terms_en.push(line);
                }
            }
        }
    });
    lr.on('end', function () {
        // All lines are read, file is closed now.
        console.log('Read ['+dir+'] done');
        if(type=='uncaught'){
            if(lan=='en'){
                console.log('['+lan+']['+type+']from index:'+currentr_uncaught_index_en+' to index:'+to_index);
                currentr_uncaught_index_en=to_index;
                console.log("next start index:"+currentr_uncaught_index_en);
            }
            else if(lan=='not_en'){
                console.log('['+lan+']['+type+']from index:'+currentr_uncaught_index_noten+' to index:'+to_index);
                currentr_uncaught_index_noten=to_index;
                console.log("next start index:"+currentr_uncaught_index_noten);
            }
        }
        fin();
    });

}
function ReadTWaddress(tw_address_filename){
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
    });

}

/*
 * search:search terms, return "caught" or "uncaught" if found, return "none" if not found, return 'ing' if processing
 *  -ter1||ter2....
 *  -uncaught||uncaught||none||ing||caught...
*/
function searchTerm(terms,fin)
{
    var parts = terms.split('||');
    var i;
    var result="";
    for(i=0;i<parts.length;i++){
        if(uncaught_terms.indexOf(parts[i])!=-1){
            if(result==""){
                result='uncaught';
            }
            else{
                result+='||uncaught';
            }
        }
        else if(caught_terms.indexOf(parts[i])!=-1){
            if(result==""){
                result='caught';
            }
            else{
                result+='||caught';
            }
        }
        else if(processing.has(parts[i])){
            if(result==""){
                result=processing.get(parts[i]);
            }
            else{
                result+='||'+processing.get(parts[i]);
            }
        }
        else{
            if(result==""){
                result='none';
            }
            else{
                result+='||none';
            }
        }
    }
    fin(result);
}
/*
 * insert:(only insert uncaught array, and can't exists in uncaught,caught array or processing hash map)
 *  -ter1||ter2...
 *  -return insert ok terms, ter2||ter4...
*/
function insertTerm(terms,fin)
{
    var parts = terms.split('||');
    var i;
    var result="";

    for(i=0;i<parts.length;i++){
        var ischt = parts[i].match(/[\u4e00-\u9fa5]/ig);
        if(ischt!=null){
            if(caught_terms.indexOf(parts[i])==-1&&uncaught_terms.indexOf(parts[i])==-1&&!processing.has(parts[i])){
                uncaught_terms.push(parts[i]);
                if(result==""){
                    result=parts[i];
                }
                else{
                    result+='||'+parts[i];
                }
            }
        }
        else{
            if(caught_terms_en.indexOf(parts[i])==-1&&uncaught_terms_en.indexOf(parts[i])==-1&&!processing.has(parts[i])){
                uncaught_terms_en.push(parts[i]);
                if(result==""){
                    result=parts[i];
                }
                else{
                    result+='||'+parts[i];
                }
            }
        }
    }
    fin(result);
}
/*
 * delete:(only delete uncaught array)
 *  -ter1||ter2...
 *  -return delete ok terms, ter2||ter4..
*/
function deleteTerm(terms,fin)
{
    var parts = terms.split('||');
    var i;
    var result="";
    
    for(i=0;i<parts.length;i++){
        var ischt = parts[i].match(/[\u4e00-\u9fa5]/ig);
        var index;
        if(ischt!=null){
            index=uncaught_terms.indexOf(parts[i]);
            if(index!=-1){
                uncaught_terms.splice(index,1);
                if(result==""){
                    result=parts[i];
                }
                else{
                    result+='||'+parts[i];
                }
            }
        }
        else{
            index=uncaught_terms_en.indexOf(parts[i]);
            if(index!=-1){
                uncaught_terms_en.splice(index,1);
                if(result==""){
                    result=parts[i];
                }
                else{
                    result+='||'+parts[i];
                }
            }
        }
    }
    fin(result);
}
/*
 * insert:
 *  -ter1~uncaught||ter2~caught...
 *  -return update ok terms, ter2~caught||ter4~uncaught...
*/
function updateTerm(terms,fin)
{
    var parts = terms.split('||');
    var i;
    var result="";

    for(i=0;i<parts.length;i++){
        var status = parts[i].split('~');
        if(status.length!=2){
            break;
        }
        var ischt = status[0].match(/[\u4e00-\u9fa5]/ig);
        var index1;
        var index2;
        if(ischt!=null){
            if(status[1]=="caught"){
                index1=uncaught_terms.indexOf(status[0]);
                index2=caught_terms.indexOf(status[0]);
                if(index1!=-1){
                    uncaught_terms.splice(index1,1);
                }
                if(index2==-1){
                    caught_terms.push(status[0]);
                    caught_terms2file.push(status[0]);
                    if(result==""){
                        result=status[0]+'~caught';
                    }
                    else{
                        result+='||'+status[0]+'~caught';
                    }
                }
            }
            else if(status[1]=="uncaught"){
                index1=caught_terms.indexOf(status[0]);
                index2=uncaught_terms.indexOf(status[0]);
                if(index1!=-1){
                    caught_terms.splice(index1,1);
                }
                if(index2==-1){
                    uncaught_terms.push(status[0]);
                    if(result==""){
                        result=status[0]+'~uncaught';
                    }
                    else{
                        result+='||'+status[0]+'~uncaught';
                    }
                }
                
            }
        }
        else{
            if(status[1]=="caught"){
                index1=uncaught_terms_en.indexOf(status[0]);
                index2=caught_terms_en.indexOf(status[0]);
                if(index1!=-1){
                    uncaught_terms_en.splice(index1,1);
                }
                if(index2==-1){
                    caught_terms_en.push(status[0]);
                    caught_terms2file_en.push(status[0]);
                    if(result==""){
                        result=status[0]+'~caught';
                    }
                    else{
                        result+='||'+status[0]+'~caught';
                    }
                }
            }
            else if(status[1]=="uncaught"){
                index1=caught_terms_en.indexOf(status[0]);
                index2=uncaught_terms_en.indexOf(status[0]);
                if(index1!=-1){
                    caught_terms_en.splice(index1,1);
                }
                if(index2==-1){
                    uncaught_terms_en.push(status[0]);
                    if(result==""){
                        result=status[0]+'~uncaught';
                    }
                    else{
                        result+='||'+status[0]+'~uncaught';
                    }
                }
            }
        }
    }
    fin(result);
}

/*---------for term Server  manage--------------
 * --Action--
 * search:search terms
 *  -ter1||ter2....
 * update:uncaught<=>caught
 *  -ter1~caught||ter2~uncaught||....
 * insert:
 *  -ter1||ter2...
 * delete:
 *  -ter1||ter2...
 * show:
 *  -no need for parameter
 *  -return terms array num status
 * insertFile:(only for localhost)
 *  -filename and lan
 * --Lan--
 *  not_en or en, default id "not_en"
 * --key--
 *  specific key
 --------------------------------------*/
app.get('/'+server_name+'/:key/v1.0/:action(search|update|insert|delete|show|insertFile)/:lan(en|not_en)?',function(req,res){
    var key = req.params.key;
    var action = req.params.action;
    var terms = req.query.terms;//allow mutiple terms=> ter1||ter2||...
    /*deprecated, only allow read terms from 'uncaught' file, there's an index to record current read line.
    var filename = req.query.filename;//for localhost insertFile(terms)
    */
    var filename='uncaught';
    var lan = req.params.lan;//for localhost insertFile(terms)
    if(key!=termKey||typeof action==="undefined"||(typeof terms==="undefined"&&(action!="show"&&action!="insertFile"))){
        res.send("illegal request");
        return;
    }
    console.log("--action:"+action+"--");
    if(action=="insertFile"){
        if(typeof filename !=="undefined"){
            if(typeof lan==='undefined'){
                lan = 'not_en';
            }
            ReadTerms('uncaught',lan,search_terms_filename,filename,()=>{
                if(lan=='not_en'){
                    res.send("uncaught:"+uncaught_terms.length)
                }
                else if(lan=='en'){
                    res.send("uncaught:"+uncaught_terms_en.length)
                }

            });
        }
        else{
            res.send("");
        }
    }
    else if(action=="search"){
        searchTerm(terms,(result)=>{
            res.send(result);
        });
    }
    else if(action=="show"){
        var result='uncaught_terms_en:'+uncaught_terms_en.length+' caught_terms_en:'+caught_terms_en.length+'\n'+
                    'uncaught_terms:'+uncaught_terms.length+' caught_terms:'+caught_terms.length;
        res.send(result);
                    
    }
    else if(action=="update"){
        updateTerm(terms,(result)=>{
            res.send(result);
        });
    }
    else if(action=="insert"){
        insertTerm(terms,(result)=>{
            res.send(result);
        });
    }
    else if(action=="delete"){
        deleteTerm(terms,(result)=>{
            res.send(result);
        });
    }
    else{
        res.send("illegal request");
        return;
    }
});

/*---------for term Server  manage--------------
 * getTerms(use pop array, and throw trem to processing map)
 *  -num(default:5): limit 5
 *  -lan(default:not_en)
 *  return ter1||ter2....
 *  update processing map: term,"ing"  ,if term's status is not "ing" then can throw it to client bot
 * if there are no terms in the "uncaught" then return "null" to client 
 --------------------------------------*/
app.get('/'+server_name+'/:key/v1.0/getTerms/:lan(en|not_en)?',function(req,res){
    var key = req.params.key;
    var lan = req.params.lan;
    var num = req.query.num;
    if(key!=termKey){
        res.send("illegal request");
        return;
    }
    if(typeof num==="undefined"||num>limit_requireTerm||num<1){
        num=limit_requireTerm;
    }
    if(typeof lan==="undefined"||(lan!="en"&&lan!="not_en")){
        lan="not_en";
    }
    var i;
    var result="";
    for(i=0;i<num;i++){
        if(lan=='not_en'){
            var term = uncaught_terms.pop();
            if(typeof term==="undefined"){
                break;
            }
            else{
                if(!processing.has(term)){
                    if(result==""){
                        result=term;
                    }
                    else{
                        result+="||"+term;
                    }
                    var start_time = new Date()
                    processing.set(term,start_time);
                }
                else{
                    i--;
                }
            }
        }   
        else if(lan=="en"){
            var term = uncaught_terms_en.pop();
            if(typeof term==="undefined"){
                break;
            }
            else{
                if(!processing.has(term)){
                    if(result==""){
                        result=term;
                    }
                    else{
                        result+="||"+term;
                    }
                    var start_time = new Date()
                    processing.set(term,start_time);
                }
                else{
                    i--;
                }
            }
        }
    }
    res.send(result);
});
/*---------for term Server  manage--------------
 *--Action--
 *  -update
 *      while client bot has finishing terms-fetching, the status my be update to term||done or term||false (p.s. not allow multiple trems )
 *      -term||done
 *      -done:move terms to "caught", remove term from "uncaught"
 *      -false:still "uncaught", remove and then insert to "uncaught"
 *      remove term status from  processing map
 --------------------------------------*/
app.get('/'+server_name+'/:key/v1.0/status/:action(update)',function(req,res){
    var key = req.params.key;
    var action = req.params.action;
    var term = req.query.term;
    if(key!=termKey){
        res.send("illegal request");
        return;
    }
    var result="";
    if(action=="update"){
        var parts = term.split('||');
        if(parts.length!=2){
            console.log('[status] false:illegal format');
        }
        else if(!processing.has(parts[0])){
            console.log('[status] false:'+parts[0]+' not in processing');
        }
        else{
            if(parts[1]=="done"){
                var ischt = parts[0].match(/[\u4e00-\u9fa5]/ig);
                if(ischt!=null){//is Asia area's words
                    caught_terms.push(parts[0]);
                    caught_terms2file.push(parts[0]);
                }
                else{
                    caught_terms_en.push(parts[0]);
                    caught_terms2file_en.push(parts[0]);
                }
                result=parts[0];
            }
            else if(parts[1]=="false"){
                var ischt = parts[0].match(/[\u4e00-\u9fa5]/ig);
                if(ischt!=null){//is Asia area's words
                    uncaught_terms.push(parts[0]);
                }
                else{
                    uncaught_terms_en.push(parts[0]);
                }
                result=parts[0];
            }
            else{
                console.log('[status] false:'+parts[1]);
            }
            processing.remove(parts[0]);
        }
        res.send(result);
    }
});
