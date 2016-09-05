var LineByLineReader = require('line-by-line');
var iconv = require('iconv-lite');
var querystring = require("querystring");
var fs = require('fs');
var dateFormat = require('dateformat');
var HashMap = require('hashmap');
var data_daily  = new HashMap();

var service1 = JSON.parse(fs.readFileSync('./service/google_client.setting','utf8'));
var seedsDir = service1['seedsDir'];
var seeds_filename = service1['seeds_filename'];
var daily_filename = service1['daily_filename'];

var date = process.argv[2];
var type = process.argv[3];
if(typeof date==='undefined'||typeof type=='undefined'){
    console.log('請輸入日期及type[old/new]');
    return;
}

if(type=='old'){
    Read_old_total('seedLog.2016'+date);
}
else{
    Read_total('2016'+date+daily_filename);
}


function Read_old_total(filename){
    var term='',term_cnt,total_seed,old_seed,new_seed;
    var list=[];
    var set=new Object();
    term_cnt=total_seed=old_seed=new_seed=0;
    console.log('===粉專擴展狀況===')
    var options = {
        //encoding: 'utf8',
        skipEmptyLines:false
    }
    var lr = new LineByLineReader(seedsDir+'/old/'+filename,options);
    iconv.skipDecodeWarning = true;
    lr.on('error', function (err) {
        console.log("error:"+err);
        process.exit(0);
    });
    lr.on('line', function (line) {
        if(line!='==='){

            var term = line.match('term:(.*)count_seeds')[0];
            var count_seeds = line.match('count_seeds:(.*)old')[0];
            var old_seeds = line.match('old seeds:(.*)new')[0];
            var new_seeds = line.match('new seeds:(.*)')[0];
            term=term.replace(" ","");
            term=term.replace("count_seeds","");
            term=term.replace("term:","");
            count_seeds=count_seeds.replace(" ","");
            count_seeds=count_seeds.replace("old","");
            count_seeds=count_seeds.replace("count_seeds:","");
            old_seeds=old_seeds.replace("old seeds:","");
            old_seeds=old_seeds.replace(" ","");
            old_seeds=old_seeds.replace("new","");
            new_seeds=new_seeds.replace("new seeds:","");
            new_seeds=new_seeds.replace(" ","");

            set={term:term,cnt:parseInt(new_seeds)/parseInt(count_seeds)};
            list.push(set);
            term_cnt++;
            total_seed+=parseInt(parseInt(count_seeds));
            old_seed+=parseInt(parseInt(old_seeds));
            new_seed+=parseInt(parseInt(new_seeds));
        }
    });
    lr.on('end', function () {
        var percent = new_seed/total_seed;
        var i;
        list.sort(function(a,b){
            return a['cnt']>b['cnt']? -1 : a['cnt']<b['cnt']? 1:0
        });
        for(i=0;i<list.length;i++){
            if(term==''){
                term = list[i]['term']+'('+list[i]['cnt']+')';
            }
            else{
                term +='\n'+list[i]['term']+'('+list[i]['cnt']+')';
            }
        }
        console.log('日期:'+date+'\n用google搜到的粉專:'+total_seed+'\n新的:'+new_seed+'\n使用了幾個詞彙:'+term_cnt+'\n新的比例:'+percent+'\n詞彙:\n'+term+'\n');
    });
}
function Read_total(filename){
    var term='',term_cnt,total_seed,old_seed,new_seed;
    var list=[];
    var set=new Object();
    term_cnt=total_seed=old_seed=new_seed=0;
    console.log('===粉專擴展狀況===')
    var options = {
        //encoding: 'utf8',
        skipEmptyLines:false
    }
    var lr = new LineByLineReader(seedsDir+'/'+filename,options);
    iconv.skipDecodeWarning = true;
    lr.on('error', function (err) {
        console.log("error:"+err);
        process.exit(0);
    });
    lr.on('line', function (line) {
        var part = line.split(',');
        set={term:part[0],cnt:part[3]/part[1]};
        list.push(set);
        term_cnt++;
        total_seed+=parseInt(part[1]);
        old_seed+=parseInt(part[2]);
        new_seed+=parseInt(part[3]);
    });
    lr.on('end', function () {
        var percent = new_seed/total_seed;
        var i;
        list.sort(function(a,b){
            return a['cnt']>b['cnt']? -1 : a['cnt']<b['cnt']? 1:0
        });
        for(i=0;i<list.length;i++){
            if(term==''){
                term = list[i]['term']+'('+list[i]['cnt']+')';
            }
            else{
                term +='\n'+list[i]['term']+'('+list[i]['cnt']+')';
            }
        }
        console.log('日期:'+date+'\n用google搜到的粉專:'+total_seed+'\n新的:'+new_seed+'\n使用了幾個詞彙:'+term_cnt+'\n新的比例:'+percent+'\n詞彙:\n'+term+'\n');
    });
}
