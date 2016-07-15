'use strict'
var myModule = require('../googleSearch.js');
var request = require('request');

var retry_cnt=0;

function getBotkey(type,fin){
	var setting = myModule.setting;
    request({
        url:'http://'+myModule.bot_serverip+':'+myModule.bot_serverport+'/'+myModule.bot_server_name+'/'+myModule.bot_server_version+'/getbotkey/'+type+'?key='+myModule.invitekey,
        timeout:60000
    },(err,res,body)=>{
        if(!err&&res.statusCode==200){
            var err_flag=0,err_msg='';
            try{
                var back_data=JSON.parse(body);
            }
            catch(e){
                err_flag=1;
                err_msg=e;
            }
            finally{
                if(err_flag==1){
                    fin('false','',err_msg);
                }
                else{
                    if(back_data['status']=='false'){
                        fin('false',body,back_data['error']);
                    }
                    else{
                        fin('ok',body,'');
                    }
                }
            }
        }
        else{
            if(err){
                console.log('[getBotkey] '+err.code);
                if(err.code.indexOf('TIME')!=-1){
                    if(retry_cnt>myModule.client_retrylimit){
                        console.log('[getBotkey] '+err.code+', retry reached limit');
                        fin('false','',err);
                    }
                    else{
                        retry_cnt++;   
                        setTimeout(()=>{
                            getBotkey(type,fin);
                        },client_retrytime*1000);
                    }

                }
                else{
                    fin('false','',err);
                }
            }
            else{
                console.log('[getBotkey]' +res.statusCode);
                if(res.statusCode>=500&&res.statusCode<600){
                    console.log('[getBotkey] '+res.statusCode);
                    if(retry_cnt>myModule.client_retrylimit){
                        console.log('[getBotkey] '+res.statusCode+', retry reached limit');
                        fin('false','',res.statusCode);
                    }
                    else{
                        retry_cnt++;
                        setTimeout(()=>{
                            getBotkey(type,fin);
                        },client_retrytime*1000);
                    }
                }
                else{
                    var back_result=JSON.parse(res.body);
                    fin('false','',back_result['error']);
                }
            }
        }
    });
}
function activeBot(type,info,fin){
    console.log('==send==\n'+JSON.stringify(info,null,3)+"\n==send==");
    var setting = myModule.setting;
    request({
        method:"POST",
        headers:{
            'Content-Type':'application/json',
            'Content-Length':Buffer.byteLength(JSON.stringify(info))
        },
        body:JSON.stringify(info),
        url:'http://'+myModule.bot_serverip+':'+myModule.bot_serverport+'/'+myModule.bot_server_name+'/'+myModule.botkey+'/'+myModule.bot_server_version+'/activekey/'+type,
        timeout:60000
    },(err,res,body)=>{
        if(!err&&res.statusCode==200){
            var err_flag=0,err_msg='';
            try{
                var back_data=JSON.parse(body);
            }
            catch(e){
                err_flag=1;
                err_msg=e;
            }
            finally{
                if(err_flag==1){
                    fin('false','',err_msg);
                }
                else{
                    if(back_data['status']=='false'){
                        fin('false','',back_data['error']);
                    }
                    else{
                        fin('ok',body,'');
                    }
                }
            }
        }
        else{
            if(err){
                console.log('[activeBot] '+err.code)
                if(err.code.indexOf('TIME')!=-1){
                    if(retry_cnt>myModule.client_retrylimit){
                        console.log('[activeBot] '+err.code+', retry reached limit');
                        fin('false','',err.code);
                    }
                    else{
                        retry_cnt++;
                        setTimeout(()=>{
                            activeBot(type,info,fin);
                        },client_retrytime*1000);
                    }

                }
                else{
                    fin('false','',err);
                }
            }
            else{
                if(res.statusCode>=500&&res.statusCode<600){
                    console.log('[activeBot] '+res.statusCode);
                    if(retry_cnt>myModule.client_retrylimit){
                        console.log('[activeBot] '+res.statusCode+', retry reached limit');
                        fin('false','',res.statusCode);
                    }
                    else{
                        retry_cnt++;
                        setTimeout(()=>{
                            activeBot(type,info,fin);
                        },client_retrytime*1000);
                    }

                }
                else{
                    var back_result=JSON.parse(res.body);
                    fin('false','',back_result['error']);
                }
            }
        }
    });
}
exports.getBotkey=getBotkey;
exports.activeBot=activeBot;
