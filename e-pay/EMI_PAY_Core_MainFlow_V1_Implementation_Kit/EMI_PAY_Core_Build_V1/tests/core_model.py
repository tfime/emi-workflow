"""Deterministic offline reference model for EMI PAY Core V1.
No SharePoint network calls and no business user impersonation. Python 3.10+.
This model tests transitions, not Power Automate wiring/runtime security.
"""
from __future__ import annotations
from dataclasses import dataclass,field
from typing import Any

STEPS=['BPCM1_PREPARE','BPCM2_TECH','BPCM3_PRICE','TCKT_CHECK','CHAIR_APPROVE','TCKT_PAY','SYSTEM_ARCHIVE']

class Reject(ValueError): pass

@dataclass
class Engine:
    requests:dict=field(default_factory=dict)
    commands:dict=field(default_factory=dict)
    workitems:dict=field(default_factory=dict)
    activities:dict=field(default_factory=dict)
    by_dedupe:dict=field(default_factory=dict)
    def act(self,typ:str,key:str,*,request_key:str='',dedupe:str='',actor:str='pilot-admin',payload:dict|None=None,authorized:bool=True):
        p=payload or {}; d=dedupe or key
        if key in self.commands:return self.commands[key]
        if d in self.by_dedupe:return self.commands[self.by_dedupe[d]]
        if not authorized:raise Reject('UNAUTHORIZED: actor must be verified from trusted channel')
        if not key or not d:raise Reject('CommandKey and DedupeKey required')
        result=self._run(typ,key,request_key,p,actor)
        self.commands[key]=result
        self.by_dedupe[d]=key
        return result
    def _create_work(self,r:dict, key:str):
        inst=f"{r['RequestKey']}|{r['CurrentStepKey']}|{key}"
        r['CurrentStepInstanceKey']=inst
        self.workitems.setdefault(inst,{'RequestKey':r['RequestKey'],'StepKey':r['CurrentStepKey'],'ReviewRound':r['ReviewRound'],'State':'OPEN','Decision':None})
    def _event(self,r,key,etype,actor,note=''):
        ak=f'{key}|{etype}';self.activities.setdefault(ak,{'RequestKey':r['RequestKey'],'ActivityKey':ak,'EventType':etype,'StepKey':r['CurrentStepKey'],'ReviewRound':r['ReviewRound'],'Actor':actor,'Note':note})
    def _match_expected(self,r,p):
        for k,pk in [('CurrentStepKey','expectedStepKey'),('CurrentStepInstanceKey','expectedStepInstanceKey'),('ReviewRound','expectedReviewRound')]:
            if pk not in p:raise Reject('STALE_PRECONDITION: missing '+pk)
            if r[k]!=p[pk]:raise Reject('STALE_PRECONDITION: '+pk)
    def _run(self,typ,key,request_key,p,actor):
        if typ=='CREATE_REQUEST':
            if not p.get('createdOUCode') or not p.get('paymentTypeCode') or not p.get('title'):raise Reject('INVALID_CREATE_PAYLOAD')
            rid='PAY-'+key
            if rid in self.requests:raise Reject('DUPLICATE_MASTER')
            r=dict(RequestKey=rid,Title=p['title'],PaymentTypeCode=p['paymentTypeCode'],CreatedOUCode=p['createdOUCode'],Status='DRAFT',ReviewRound=1,CurrentStepKey=STEPS[0],WorkflowVersionNo=None,UploadedCount=0,MinFileCount=0,UncDocumentKey=None,PaymentDueAt=None)
            self.requests[rid]=r;self._create_work(r,key);self._event(r,key,'REQUEST_CREATED',actor)
            return {'State':'SUCCEEDED','RequestKey':rid,'Status':r['Status']}
        if request_key not in self.requests:raise Reject('REQUEST_NOT_FOUND')
        r=self.requests[request_key]
        if r['Status'] in ('COMPLETED',):raise Reject('REQUEST_LOCKED')
        self._match_expected(r,p)
        if typ=='SUBMIT':
            if r['CurrentStepKey']!=STEPS[0] or r['Status'] not in ('DRAFT','RETURNED'):raise Reject('INVALID_SUBMIT_STATE')
            if r['UploadedCount']<r['MinFileCount']:raise Reject('MISSING_CHECKLIST')
            if r['Status']=='RETURNED':r['ReviewRound']+=1
            if r['WorkflowVersionNo'] is None:r['WorkflowVersionNo']=1
            self.workitems[r['CurrentStepInstanceKey']]['State']='CLOSED'
            r['CurrentStepKey']=STEPS[1];r['Status']='IN_PROGRESS';self._create_work(r,key);self._event(r,key,'REQUEST_SUBMITTED',actor)
        elif typ=='DECIDE':
            step=r['CurrentStepKey']
            if step not in STEPS[1:5]:raise Reject('DECIDE_NOT_ALLOWED_AT_STEP')
            dec=p.get('decision')
            if dec not in ('PASS','REJECT'):raise Reject('DECISION_INVALID')
            if dec=='REJECT' and not str(p.get('note','')).strip():raise Reject('REJECT_REASON_REQUIRED')
            if dec=='PASS' and step=='CHAIR_APPROVE' and not p.get('paymentDueAt'):raise Reject('PAYMENT_DUE_AT_REQUIRED')
            wi=self.workitems[r['CurrentStepInstanceKey']];wi['State']='CLOSED';wi['Decision']=dec
            if dec=='REJECT':
                r['CurrentStepKey']=STEPS[0];r['Status']='RETURNED';event='REQUEST_RETURNED'
            else:
                r['CurrentStepKey']=STEPS[STEPS.index(step)+1];event='STEP_APPROVED'
                if step=='CHAIR_APPROVE':
                    r['PaymentDueAt']=p['paymentDueAt']
            self._create_work(r,key);self._event(r,key,event,actor,p.get('note',''))
        elif typ=='CONFIRM_PAYMENT':
            if r['CurrentStepKey']!='TCKT_PAY':raise Reject('PAYMENT_NOT_ALLOWED_AT_STEP')
            if not p.get('uncDocumentKey') or not p.get('uncVerified',False):raise Reject('UNC_NOT_VERIFIED')
            self.workitems[r['CurrentStepInstanceKey']]['State']='CLOSED'
            r['UncDocumentKey']=p['uncDocumentKey'];r['CurrentStepKey']='SYSTEM_ARCHIVE';r['Status']='ARCHIVE_PENDING'
            self._event(r,key,'PAYMENT_RECORDED',actor)
        elif typ=='ARCHIVE_RESULT':
            raise Reject('ARCHIVE_SUBFLOW_NOT_IMPLEMENTED')
        else:raise Reject('COMMAND_NOT_SUPPORTED')
        return {'State':'SUCCEEDED','RequestKey':request_key,'Status':r['Status'],'CurrentStepKey':r['CurrentStepKey'],'ReviewRound':r['ReviewRound']}


def main():
    e=Engine();total=0
    def run(name, f):
        nonlocal total
        f();total+=1;print(f'PASS {total:02d} {name}')
    def rejected(fun,code):
        try:fun()
        except Reject as ex:
            assert code in str(ex),(code,str(ex));return
        raise AssertionError('Expected rejection '+code)
    c=e.act('CREATE_REQUEST','TST-0001-CREATE',payload={'title':'DEMO PAY SPV','paymentTypeCode':'DEMO','createdOUCode':'OU-DEMO'})
    rid=c['RequestKey'];r=e.requests[rid];run('Create a single master',lambda: (assert_same(r['Status'],'DRAFT'),assert_same(len(e.requests),1)))
    initialkey=r['CurrentStepInstanceKey'];base=lambda:dict(expectedStepKey=r['CurrentStepKey'],expectedStepInstanceKey=r['CurrentStepInstanceKey'],expectedReviewRound=r['ReviewRound'])
    run('Duplicate command is no-op', lambda:assert_same(e.act('CREATE_REQUEST','TST-0001-CREATE')['RequestKey'],rid))
    run('Unauthorized command blocked',lambda:rejected(lambda:e.act('SUBMIT','U-1',request_key=rid,payload=base(),authorized=False),'UNAUTHORIZED'))
    run('Invalid step rejected',lambda:rejected(lambda:e.act('DECIDE','WR-1',request_key=rid,payload={**base(),'decision':'PASS'}),'DECIDE_NOT_ALLOWED'))
    r['MinFileCount']=2;r['UploadedCount']=1
    run('Checklist missing blocks submit',lambda:rejected(lambda:e.act('SUBMIT','S-0',request_key=rid,payload=base()),'MISSING_CHECKLIST'))
    r['UploadedCount']=2
    e.act('SUBMIT','S-1',request_key=rid,payload=base());run('Submit 1 routes to BPCM2',lambda:assert_same(r['CurrentStepKey'],'BPCM2_TECH'))
    e.act('DECIDE','D-1',request_key=rid,payload={**base(),'decision':'REJECT','note':'Thiếu nghiệm thu'})
    run('Reject routes directly to BPCM1',lambda:assert_same(r['CurrentStepKey'],'BPCM1_PREPARE'))
    run('ReviewRound not incremented on reject',lambda:assert_same(r['ReviewRound'],1))
    e.act('SUBMIT','S-2',request_key=rid,payload=base())
    run('Resubmit increments ReviewRound',lambda:assert_same(r['ReviewRound'],2))
    run('Resubmit goes to BPCM2',lambda:assert_same(r['CurrentStepKey'],'BPCM2_TECH'))
    run('Stale expected round blocked',lambda:rejected(lambda:e.act('DECIDE','D-X',request_key=rid,payload={**base(),'expectedReviewRound':1,'decision':'PASS'}),'STALE_PRECONDITION'))
    for idx,step in enumerate(STEPS[1:5],start=2):
        assert r['CurrentStepKey']==step
        pay={**base(),'decision':'PASS'}
        if step=='CHAIR_APPROVE':pay['paymentDueAt']='2026-12-15T00:00:00Z'
        e.act('DECIDE',f'PASS-{idx}',request_key=rid,payload=pay)
    run('Pass approvals reaches TCKT_PAY',lambda:assert_same(r['CurrentStepKey'],'TCKT_PAY'))
    run('UNC is mandatory',lambda:rejected(lambda:e.act('CONFIRM_PAYMENT','P-0',request_key=rid,payload=base()),'UNC_NOT_VERIFIED'))
    e.act('CONFIRM_PAYMENT','P-1',request_key=rid,payload={**base(),'uncDocumentKey':'DOC-UNC-01','uncVerified':True})
    run('Payment ends at ARCHIVE_PENDING',lambda:assert_same(r['Status'],'ARCHIVE_PENDING'))
    run('No automatic COMPLETED without archive',lambda:assert_same(r['CurrentStepKey'],'SYSTEM_ARCHIVE'))
    run('Archive result not yet enabled',lambda:rejected(lambda:e.act('ARCHIVE_RESULT','A-1',request_key=rid,payload=base()),'ARCHIVE_SUBFLOW_NOT_IMPLEMENTED'))
    run('No duplicate WorkItems',lambda:assert_same(len(e.workitems),8))
    run('Activity keys unique',lambda:assert_same(len(e.activities),len(set(e.activities))))
    print('OFFLINE MODEL PASS:',total,'assertions; no SharePoint/Power Automate execution performed')

def assert_same(a,b):
    assert a==b,(a,b)

if __name__=='__main__':main()
