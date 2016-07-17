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
if(typeof date==='undefined'){
    console.log('請輸入日期');
    return;
}

Read_total('2016'+date+daily_filename);

function Read_total(filename){
    var term='',term_cnt,total_seed,old_seed,new_seed;
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
        if(term==''){
            term = part[0];
        }
        else{
            term +=','+part[0];
        }

        term_cnt++;
        total_seed+=parseInt(part[1]);
        old_seed+=parseInt(part[2]);
        new_seed+=parseInt(part[3]);
    });
    lr.on('end', function () {
        var percent = new_seed/total_seed;
        console.log('用google搜到的粉專:'+total_seed+'\n新的:'+new_seed+'\n使用了幾個詞彙:'+term_cnt+'\n新的比例:'+percent);
    });
}
