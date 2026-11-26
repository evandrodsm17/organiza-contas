// The wizard is deliberately independent of the main dashboard renderer.
export const onboardingSteps = [
  ["welcome","Bem-vindo ao Organiza Contas","Configure seu espaço financeiro em poucos passos.","wallet"],
  ["management","Seu primeiro gerenciamento","Crie um espaço pessoal ou familiar para organizar suas contas.","spaces"],
  ["income","Sua primeira entrada","Registre uma renda prevista ou já recebida.","wallet"],
  ["expense","Sua primeira despesa","Cadastre uma conta e acompanhe seu vencimento.","expenses"],
  ["card","Seu primeiro cartão","Identifique suas faturas sem informar número ou código de segurança.","cards"],
  ["limit","Seu limite mensal","Defina um teto de gastos para o mês atual.","budget"],
  ["goal","Sua primeira meta","Planeje um objetivo financeiro sem alterar seu saldo.","goals"],
  ["finish","Tudo pronto!","Seu espaço financeiro está preparado. Continue organizando suas contas.","checklist"]
];
export function createOnboarding({state,api,esc,attr,toast,render,today}) {
  let opened=false, step=0, busy=false, draft={}, generation=0;
  const key=()=> "organiza-onboarding-v1:"+state.user?.uid;
  const get=()=>{try{return JSON.parse(localStorage.getItem(key())||"{}")}catch{return {}}};
  const put=value=>{try{localStorage.setItem(key(),JSON.stringify(value))}catch{}};
  const canCreate=()=>state.profile?.role==="master"||state.profile?.canCreateManagement===true;
  const editable=m=>m&&["owner","editor"].includes(m.memberRoles?.[state.user?.uid]);
  const selected=()=>state.managements.find(m=>m.id===get().mid)||state.selected;
  const eligible=()=>canCreate()||state.managements.some(editable);
  const done=()=>get().done||[];
  const reset=()=>{generation++;opened=false;busy=false;step=0;draft={};};
  function start(auto=false) {
    if(!eligible()||opened)return;
    const p=get();
    if(auto&&(p.dismissed||p.finished||p.started||state.managements.length))return;
    put({...p,started:true});
    opened=true;step=Number.isInteger(p.step)?Math.max(0,Math.min(7,p.step)):0;draft={};
    paint();
  }
  function close(finished=false,dismissed=false){
    put({...get(),step,finished,dismissed,started:true});
    reset();document.querySelector("#onboardingRoot")?.remove();render();
  }
  const label=(title,name,type="text",value="",extra="")=>`<label>${title}<input name="${name}" type="${type}" value="${attr(draft[name]??value)}" ${extra}></label>`;
  const select=(title,name,options,value)=>`<label>${title}<select name="${name}">${options.map(([v,t])=>`<option value="${attr(v)}" ${String(draft[name]??value)===String(v)?"selected":""}>${esc(t)}</option>`).join("")}</select></label>`;
  function fields(){
    if(step===1){
      const spaces=state.managements.filter(editable);
      return (spaces.length?select("Espaço financeiro","existing",[...(canCreate()?[["","Criar novo gerenciamento"]]:[]),...spaces.map(m=>[m.id,m.name])],selected()?.id||""):"")+(canCreate()?label("Nome do novo gerenciamento","name","text","Minhas finanças",'maxlength="80"')+select("Tipo de espaço","symbol",[["wallet","Pessoal"],["home","Casa e família"],["chart","Projetos"]],"wallet"):"");
    }
    if(step===2||step===3)return label("Descrição","description","text","",'required maxlength="160" placeholder="Ex.: '+(step===2?"Salário":"Internet")+'"')+label("Valor (R$)","amount","number","",'required min="0.01" max="1000000000000" step="0.01"')+select("Categoria","category",(step===2?["Salário","Freelance","Benefício","Outros"]:["Água","Energia","Internet","Alimentação","Moradia","Transporte","Saúde","Outros"]).map(x=>[x,x]),step===2?"Salário":"Outros")+label(step===2?"Data de recebimento":"Vencimento","dueDate","date",today(),"required")+select("Situação","status",[["pending","Previsto / pendente"],["paid",step===2?"Recebido":"Pago"]],"pending")+`<div data-ob-paid>${label("Data efetiva","paidDate","date",today())}</div>`;
    if(step===4)return label("Nome do cartão","name","text","",'required maxlength="60" placeholder="Ex.: Nubank"')+label("Nome do titular","holderName","text",state.profile.name,'required maxlength="100"')+label("Dia de vencimento","dueDay","number","10",'required min="1" max="31" step="1"')+label("Dia de fechamento (opcional)","closingDay","number","",'min="1" max="31" step="1"');
    if(step===5)return label("Limite de despesas (R$)","amount","number","",'required min="0.01" max="1000000000000" step="0.01"')+`<p>Período: ${esc(state.month)}</p>`;
    if(step===6)return label("Nome da meta","name","text","",'required maxlength="80" placeholder="Ex.: Reserva de emergência"')+label("Valor-alvo (R$)","target","number","",'required min="0.01" max="1000000000000" step="0.01"')+label("Já reservado (R$)","saved","number","0",'required min="0" max="1000000000000" step="0.01"')+label("Prazo opcional","deadline","date");
    return step===7?`<ul>${onboardingSteps.slice(1,7).map(([id,title])=>`<li>${done().includes(id)?"✓":"–"} ${esc(title)}${done().includes(id)?"":" (opcional / não realizado)"}</li>`).join("")}</ul>`:"<p>Você pode pular as etapas opcionais e voltar quando quiser. Nenhum lançamento será criado sem sua confirmação.</p>";
  }
  function paint(){
    if(!opened||busy)return;
    let root=document.querySelector("#onboardingRoot");
    if(!root){root=document.createElement("div");root.id="onboardingRoot";document.body.append(root);}
    const [id,title,description,art]=onboardingSteps[step];
    root.innerHTML=`<div class="onboarding-backdrop"><section class="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="ob-title"><header><span>PRIMEIROS PASSOS · ${step+1}/8</span><button type="button" data-ob-close aria-label="Continuar depois">×</button></header><div class="onboarding-progress"><span style="width:${(step+1)/8*100}%"></span></div><div class="onboarding-dots">${onboardingSteps.map((s,i)=>`<span class="${i===step?"active":done().includes(s[0])?"complete":""}" title="${esc(s[1])}">${done().includes(s[0])?"✓":i+1}</span>`).join("")}</div><div class="onboarding-intro"><div><h2 id="ob-title">${title}</h2><p>${description}</p></div><img src="assets/images/finance/${art}.png" alt=""></div><form id="onboardingForm"><div class="onboarding-fields">${done().includes(id)&&step>0&&step<7?"<p>Etapa já cadastrada. Continue sem duplicar os dados.</p>":fields()}</div><p data-ob-error role="alert"></p><footer>${step>0?'<button class="btn btn-soft" type="button" data-ob-back>Voltar</button>':""}<span></span>${step>1&&step<7?'<button class="btn btn-soft" type="button" data-ob-skip>Pular etapa</button>':""}<button class="btn btn-primary" type="submit">${step===0?"Começar":step===7?"Ir para o dashboard":done().includes(id)?"Continuar":"Salvar e continuar"}</button></footer></form><button type="button" class="onboarding-dismiss" data-ob-dismiss>Não mostrar novamente</button></section></div>`;
    const form=root.querySelector("form");
    const capture=()=>{draft=Object.fromEntries(new FormData(form));};
    function sync(){
      const status=form.elements.status;const paid=form.querySelector("[data-ob-paid]");
      if(status&&paid){paid.hidden=status.value!=="paid";form.elements.paidDate.required=status.value==="paid";}
      if(form.elements.existing&&form.elements.name){form.elements.name.required=!form.elements.existing.value;form.elements.name.disabled=!!form.elements.existing.value;form.elements.symbol.disabled=!!form.elements.existing.value;}
    }
    form.addEventListener("input",()=>{capture();sync();});sync();
    root.querySelector("[data-ob-close]").onclick=()=>{if(!busy)close();};
    root.querySelector("[data-ob-dismiss]").onclick=()=>{if(!busy)close(false,true);};
    root.querySelector("[data-ob-back]")?.addEventListener("click",()=>advance(step-1));
    root.querySelector("[data-ob-skip]")?.addEventListener("click",()=>advance(step+1));
    form.onsubmit=async e=>{
      e.preventDefault();if(busy)return;
      if(step===7){close(true);return;}
      if(step===0||done().includes(id)){advance(step+1);return;}
      capture();busy=true;const token=generation;const uid=state.user.uid;
      const controls=[...root.querySelectorAll("button,input,select")];const disabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);
      try{
        let mid=get().mid;
        if(step===1){
          if(draft.existing){if(!editable(state.managements.find(m=>m.id===draft.existing)))throw Error("Espaço sem permissão de edição.");mid=draft.existing;}
          else {if(!canCreate())throw Error("Sem permissão para criar gerenciamento.");const result=await api.createManagement({name:draft.name,description:"",appearance:{symbol:draft.symbol||"wallet",color:"#3157D5"}});mid=result.id;}
        }else{
          if(!mid)throw Error("Crie ou selecione um gerenciamento na etapa anterior.");
          if(step===2||step===3)await api.saveTransaction(mid,{type:step===2?"income":"expense",description:draft.description,category:draft.category,amount:Number(draft.amount),dueDate:draft.dueDate,status:draft.status,paidDate:draft.status==="paid"?draft.paidDate:"",plannedDate:""},uid);
          if(step===4)await api.saveCard(mid,{name:draft.name,holderName:draft.holderName,dueDay:Number(draft.dueDay),closingDay:draft.closingDay?Number(draft.closingDay):null,backgroundColor:"#3157D5"},uid);
          if(step===5)await api.setMonthlyExpenseLimit(mid,state.month,Number(draft.amount));
          if(step===6)await api.createGoal(mid,{name:draft.name,target:Number(draft.target),saved:Number(draft.saved),deadline:draft.deadline||""});
        }
        if(token!==generation||uid!==state.user?.uid)return;
        put({...get(),mid,done:[...new Set([...done(),id])]});busy=false;advance(step+1);
      }catch(error){if(token!==generation)return;root.querySelector("[data-ob-error]").textContent=error.message;controls.forEach((c,i)=>c.disabled=disabled[i]);busy=false;}
    };
  }
  function advance(next){if(busy)return;step=next;draft={};put({...get(),step});paint();}
  function card(){
    if(!eligible())return "";
    const p=get();if(p.finished||p.dismissed||(!p.started&&state.managements.length))return "";
    const count=done().filter(id=>onboardingSteps.slice(1,7).some(s=>s[0]===id)).length;
    return `<section class="panel onboarding-card"><img src="assets/images/finance/checklist.png" alt=""><div><h2>Primeiros passos</h2><p>${count} de 6 configurações realizadas</p><div class="onboarding-progress"><span style="width:${count/6*100}%"></span></div></div><button class="btn btn-primary" type="button" data-onboarding-start>Continuar configuração</button></section>`;
  }
  function settings(){return eligible()?`<section class="panel settings-card"><h2>Primeiros passos</h2><p>Abra o assistente para concluir sua configuração inicial.</p><button class="btn btn-soft" type="button" data-onboarding-start>Abrir assistente</button></section>`:"";}
  return {start,card,settings,reset,isOpen:()=>opened,bind(){document.querySelectorAll("[data-onboarding-start]").forEach(b=>b.onclick=()=>start());}};
}
