const wrapperCodes=new Set(['extraction_input_invalid','extraction_unavailable','extraction_authentication','extraction_cli_failed','extraction_result_missing','extraction_result_invalid','extraction_source_unknown','extraction_source_duplicate','extraction_title_empty']);
function classifyExtractionFailure(output,wrapperOutput=''){
 const record=wrapperOutput.split(/\r?\n/).map(line=>line.match(/^TASKCAPTURE_EXTRACTION_ERROR:([a-z_]+)$/)).find(m=>m&&wrapperCodes.has(m[1]));
 if(record&&record[1]!=='extraction_cli_failed')return record[1];
 // Restrict classification to error records: untrusted input may itself mention quotas.
 const errors=output.split(/\r?\n/).filter(line=>/^\s*(?:ERROR(?:\s|:)|Error:|error:)/.test(line));
 const text=errors.join('\n');
 if(/usage.limit|rate.limit|quota|limit reached|429/i.test(text))return 'subscription_limit';
 if(/not supported|unsupported|model.*(?:unavailable|not found|does not exist)|invalid model/i.test(text))return 'extraction_model_unavailable';
 if(/401|unauthorized|authentication|sign.in|log.in/i.test(text))return 'extraction_authentication';
 if(/network|connection|connect|timed out|stream disconnected/i.test(text))return 'extraction_connection';
 return record?'extraction_cli_failed':'extraction_failed';
}
module.exports={classifyExtractionFailure};
