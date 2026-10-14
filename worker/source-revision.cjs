const {hash}=require('./intake-store.cjs');
function semanticRevision(body){const {group,sender_name,is_direct,...stable}=body;return hash(JSON.stringify(stable));}
function revisionFor(body,previousBody,previousRevision){return previousBody&&semanticRevision(body)===semanticRevision(previousBody)?previousRevision:semanticRevision(body);}
module.exports={semanticRevision,revisionFor};
