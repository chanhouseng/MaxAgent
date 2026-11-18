'use strict';
const crypto=require('node:crypto'),os=require('node:os');
module.exports='\\\\.\\pipe\\maxagent-claude-pet-'+crypto.createHash('sha256').update(os.homedir().toLowerCase()).digest('hex').slice(0,20);
