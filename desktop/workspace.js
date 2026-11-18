(function(root){
 function categories(item){const list=[],job=item.job||{};if(item.unread)list.push('unread');if(item.observedRunning===true||['running','confirming'].includes(job.status)&&!['prepared','possibly_sent'].includes(job.phase))list.push('running');if(['queued','result_unavailable'].includes(job.status)||Number(job.pendingCount)>0)list.push('pending');return list}
 function dispatchLabel(job){if(!job)return '';const accepted=job.phase==='accepted'&&typeof job.turn==='string'&&!!job.turn;if(job.status==='running')return accepted?'原對話已接收，處理中':job.phase==='prepared'?'準備派工':'正在送出，尚未確認接收';if(job.status==='result_unavailable')return accepted?'原對話已接收，結果未確認':'可能已送出，結果未確認';if(job.status==='queued')return '排隊中';return ''}
 if(typeof module!=='undefined')module.exports={categories,dispatchLabel};else {root.workCategories=categories;root.dispatchLabel=dispatchLabel}
})(globalThis);
