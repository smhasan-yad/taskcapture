// Log only fixed codes/phase names. Never include exception text or untrusted values.
const phases=new Set(['configuration','processor_lock','state_open','recoverable_drafts','decrypt_drafts','pending_selection','decrypt_pending','decrypt_context','candidate_selection','queue_filter','ticktick_connect','ticktick_projects','list_existing_tasks','queue_input','extraction','parse_extraction','validation','task_enrichment','encrypt_drafts','persist_drafts','task_delivery']);
const operations=new Set(['initialize','mcpServerStatus/list','thread/start','model/list','list_projects','get_project_with_undone_tasks','create_task','get_task_by_id','update_task','unknown']);
const codes=new Set(['ticktick_timeout','ticktick_protocol_failed','ticktick_connector_stopped','ticktick_connector_unavailable','ticktick_connector_closed','ticktick_pipe_failed','queue_cleanup_failed']);
const messages=new Map([['TickTick request timed out','ticktick_timeout'],['TickTick protocol request failed','ticktick_protocol_failed'],['TickTick connector stopped','ticktick_connector_stopped'],['TickTick connector unavailable','ticktick_connector_unavailable'],['TickTick connector closed','ticktick_connector_closed'],['Windows encryption timed out','encryption_timeout'],['Windows encryption failed','encryption_failed'],['Windows encryption unavailable','encryption_unavailable'],['Invalid encryption response','encryption_invalid_response'],['Invalid extraction envelope','validation_envelope'],['Invalid task fields','validation_fields'],['Invalid task text or review flag','validation_text'],['Invalid deadline','validation_deadline'],['Invalid calendar deadline','validation_calendar'],['Unknown duplicate target','validation_duplicate_target'],['Invalid related sources','validation_related_sources'],['Unknown or repeated source identity','validation_source_identity'],['Task validation failed','validation_task'],['Missing related source identities','validation_related_sources'],['Invalid or repeated related source identity','validation_source_identity']]);
function createQueueDiagnostics(){return {phase:'configuration',modelCalled:false};}
function describeQueueFailure(error,diagnostics){
 const phase=phases.has(diagnostics.phase)?diagnostics.phase:'unknown';
 const code=codes.has(error?.code)?error.code:messages.get(error?.message)||(phase==='parse_extraction'&&error instanceof SyntaxError?'validation_json':'queue_failed');
 const summary={queuePreserved:true,errorCode:code,phase,modelCalled:diagnostics.modelCalled===true};
 if(operations.has(error?.operation))summary.operation=error.operation;
 return summary;
}
function cleanQueue(actions){let failures=0;for(const action of actions){try{action();}catch{failures++;}}return failures;}
module.exports={createQueueDiagnostics,describeQueueFailure,cleanQueue};
