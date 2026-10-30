import ts from 'typescript';

/** Parse selected const data. Source JavaScript is never evaluated or imported. */
export function readSourceLiterals(source,names=['L','SIT_PEND','SIT_ANC']){
 const file=ts.createSourceFile('source-app.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 if(file.parseDiagnostics.length)throw Error('Source JavaScript did not parse cleanly');
 const selected=new Set(names),found=new Map();
 function literal(node){
  if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)){
   if(/https?:\/\/|\bBearer\s|sb_secret_|[?&](?:token|sig|key)=/i.test(node.text))throw Error('URL or credential-like data is excluded from UI option metadata');
   return node.text;
  }
  if(ts.isNumericLiteral(node)){const value=Number(node.text);if(!Number.isFinite(value))throw Error('Nonfinite literal');return value;}
  if(node.kind===ts.SyntaxKind.TrueKeyword)return true;
  if(node.kind===ts.SyntaxKind.FalseKeyword)return false;
  if(node.kind===ts.SyntaxKind.NullKeyword)return null;
  if(ts.isArrayLiteralExpression(node))return node.elements.map(literal);
  if(ts.isObjectLiteralExpression(node)){
   const result=Object.create(null);
   for(const property of node.properties){
    if(!ts.isPropertyAssignment(property)||ts.isComputedPropertyName(property.name))throw Error('Only literal property assignments are allowed');
    const name=property.name;
    if(!ts.isIdentifier(name)&&!ts.isStringLiteral(name)&&!ts.isNumericLiteral(name))throw Error('Unsupported literal property name');
    const key=name.text;
    if(['__proto__','constructor','prototype'].includes(key)||Object.hasOwn(result,key))throw Error('Ambiguous or unsafe literal property');
    result[key]=literal(property.initializer);
   }
   return result;
  }
  throw Error(`Nonliteral UI option initializer rejected: ${ts.SyntaxKind[node.kind]}`);
 }
 for(const statement of file.statements){
  if(!ts.isVariableStatement(statement))continue;
  for(const declaration of statement.declarationList.declarations){
   if(!ts.isIdentifier(declaration.name)||!selected.has(declaration.name.text))continue;
   if(!(statement.declarationList.flags&ts.NodeFlags.Const)||found.has(declaration.name.text)||!declaration.initializer)throw Error('Selected UI data must be one top-level const initializer');
   found.set(declaration.name.text,literal(declaration.initializer));
  }
 }
 if(found.size!==selected.size)throw Error('One or more selected UI dictionaries were not found');
 return Object.fromEntries(names.map(name=>[name,found.get(name)]));
}
