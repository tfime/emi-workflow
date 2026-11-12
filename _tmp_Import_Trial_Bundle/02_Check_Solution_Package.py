#!/usr/bin/env python3
import zipfile,json,sys,xml.etree.ElementTree as ET,re,collections
from pathlib import Path
path=Path(sys.argv[1])
assert path.is_file()
with zipfile.ZipFile(path) as z:
 assert z.testzip() is None
 names=z.namelist();assert len(names)==4,names
 sol=ET.fromstring(z.read('solution.xml'));cus=ET.fromstring(z.read('customizations.xml'))
 wk=cus.find('.//Workflows/Workflow');nm=wk.find('JsonFileName').text.lstrip('/')
 assert nm in names,(nm,names)
 wf=json.loads(z.read(nm))
 defn=wf['properties']['definition'];roots=defn['actions']
 assert defn['triggers']['When_Command_Created']['inputs']['parameters']['table']=='e16b76dc-7686-43e9-b232-18c80e2b31d2'
 assert sol.find('.//SolutionManifest/UniqueName').text=='EMI_PAY_CORE_V1'
 assert sol.find('.//SolutionManifest/Version').text=='1.0.0.2'
 assert wk.get('WorkflowId').lower().strip('{}')=='1703d2f2-46de-f111-84ea-000d3aa191f1'
 assert wk.find('StateCode').text=='0'
 assert roots['C00_PilotEnabled']['inputs']=='false'
 assert 'shared_teams' not in wf['properties']['connectionReferences']
 assert 'shared_sharepointonline' in wf['properties']['connectionReferences']
 allacts={}; parent_actions=[]
 def walk(actions,parent):
  assert len(actions)==len(set(actions))
  for n,a in actions.items():
   assert n not in allacts,('duplicate name',n)
   allacts[n]=a
   for x in a.get('runAfter',{}):
    assert x in actions,(n,'invalid runAfter sibling',x,parent)
   if a['type']=='Scope':walk(a['actions'],parent+'/'+n)
   elif a['type']=='If':
    walk(a['actions'],parent+'/'+n+'/then')
    walk(a.get('else',{}).get('actions',{}),parent+'/'+n+'/else')
   elif a['type']=='Switch':
    for label,case in a.get('cases',{}).items():walk(case['actions'],parent+'/'+n+'/'+label)
    walk(a.get('default',{}).get('actions',{}),parent+'/'+n+'/default')
   if a['type']=='OpenApiConnection' and a.get('inputs',{}).get('host',{}).get('operationId')=='HttpRequest':
    inputs=a['inputs']['parameters']
    assert inputs['dataset']=='https://emicomvn.sharepoint.com/sites/cecm'
    assert '/_api/' in inputs['parameters/uri'] or inputs['parameters/uri'].startswith('_api/')
    assert inputs['parameters/method'] in ['GET','POST']
    if inputs['parameters/method']=='POST':
     assert isinstance(inputs.get('parameters/body'),str),(n,'non-string POST body')
    if a.get('inputs',{}).get('host',{}).get('connectionName')!='shared_sharepointonline':raise AssertionError(n)
 walk(roots,'root')
 for tr in defn['triggers'].values():assert tr['inputs']['host']['connectionName']=='shared_sharepointonline'
 varnames={v['name'] for a in roots.values() if a['type']=='InitializeVariable' for v in a['inputs']['variables']}
 assert varnames=={'vMasterId','vWriteStarted'}
 errors=[]
 patterns=[re.compile(r"\b(?:body|outputs|actions|result)\('([^']+)'\)"), re.compile(r"\bvariables\('([^']+)'\)")]
 def check_text(src,owner):
  for r in patterns[0].findall(src):
   if r not in allacts:errors.append(('unknown-action',owner,r))
  for r in patterns[1].findall(src):
   if r not in varnames:errors.append(('unknown-var',owner,r))
  for expr in [src] if src.startswith('@') else re.findall(r'@\{([^{}]*)\}',src):
   # Balance parentheses outside WDL single-quoted string literals.
   depth=0;quote=False;i=0;st=expr.lstrip('@')
   while i<len(st):
    c=st[i]
    if c=="'":
     if quote and i+1<len(st) and st[i+1]=="'":i+=2;continue
     quote=not quote
    if not quote:
     if c=='(':depth+=1
     elif c==')':depth-=1
     if depth<0:errors.append(('bad-parens-negative',owner,expr[:100]));break
    i+=1
   if depth!=0 or quote:errors.append(('bad-parens-or-quotes',owner,depth,quote,expr[:120]))
 def visit(x,owner):
  if isinstance(x,str):check_text(x,owner)
  elif isinstance(x,list):
   for y in x:visit(y,owner)
  elif isinstance(x,dict):
   for k,v in x.items():visit(v,owner+'/'+k)
 visit(defn,'Definition')
 if errors:
  print('ERRORS',len(errors))
  for e in errors[:50]:print(e)
  sys.exit(2)
 print('PASS: ZIP consistency, XML links, GUID, flow identity, disabled state, connections, action refs and WDL balance')
 print('Workflow actions',len(allacts),'trigger',list(defn['triggers']))
 print('OpenAPI actions',sum(a['type']=='OpenApiConnection' for a in allacts.values()))
 print('IF actions',sum(a['type']=='If' for a in allacts.values()))
 print('Flow version',sol.find('.//SolutionManifest/Version').text)
