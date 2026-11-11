(function(root){
 function createController(api){let seq=0;return {current:null,history:null,async open(k){this.current=k;const n=++seq;const data=await api.history(k);if(n!==seq)return;this.history=data;if(data.last)await api.read(k,data.last);return data},async refresh(){const k=this.current;if(!k)return;const n=++seq;const data=await api.history(k);if(n!==seq)return;this.history=data;return data},async send(text){if(!this.current)throw Error('請先選擇聊天室。');return api.send(this.current,text)}}}
 if(typeof module!=='undefined')module.exports={createController};else root.createController=createController;
})(globalThis);
