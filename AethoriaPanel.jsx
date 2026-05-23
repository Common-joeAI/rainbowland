import { useState, useEffect, useCallback } from 'react'

const _isLocal = window.location.port !== ''
const API = _isLocal
  ? `http://${window.location.hostname}:8000`
  : `${window.location.protocol}//${window.location.host}`

const C = {
  bg:'#06060d', panel:'rgba(255,255,255,0.04)', border:'rgba(255,255,255,0.08)',
  accent:'#7c6fff', green:'#10b981', red:'#ef4444', yellow:'#f59e0b',
  blue:'#38bdf8', pink:'#ec4899', text:'rgba(255,255,255,0.85)', muted:'rgba(255,255,255,0.35)',
}

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div style={{ background:C.panel, border:`1px solid ${color||C.border}33`,
      borderRadius:14, padding:'14px 16px', flex:1, minWidth:120 }}>
      <div style={{ fontSize:22, marginBottom:4 }}>{icon}</div>
      <div style={{ fontSize:22, fontWeight:800, color:color||C.text, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{sub}</div>}
      <div style={{ fontSize:11, color:C.muted, marginTop:4, textTransform:'uppercase', letterSpacing:1 }}>{label}</div>
    </div>
  )
}

function NeedBar({ val, color }) {
  const v = Math.max(0, Math.min(1, val || 1))
  const bg = v < 0.25 ? C.red : v < 0.6 ? C.yellow : color
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
      <div style={{ width:40, height:4, background:'rgba(255,255,255,0.08)', borderRadius:99 }}>
        <div style={{ height:'100%', width:`${v*100}%`, background:bg, borderRadius:99 }} />
      </div>
      <span style={{ fontSize:9, color:C.muted, width:26 }}>{Math.round(v*100)}%</span>
    </div>
  )
}

function AgentRow({ a }) {
  const moodClr = { content:C.green, happy:C.green, desperate:C.red, neutral:C.muted, curious:C.blue }[a.mood] || C.muted
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 76px 64px repeat(3,50px) 58px',
      gap:4, alignItems:'center', padding:'7px 0',
      borderBottom:'1px solid rgba(255,255,255,0.04)', opacity:a.is_dead?0.35:1 }}>
      <div>
        <span style={{ fontWeight:600, fontSize:12, color:a.is_dead?'#666':C.text }}>
          {a.is_dead?'☠️ ':''}{a.name}
        </span>
        {(a.generation||1)>1 && <span style={{ fontSize:9, color:C.accent, marginLeft:5 }}>gen{a.generation}</span>}
      </div>
      <span style={{ fontSize:11, color:C.muted }}>{a.role}</span>
      <span style={{ fontSize:11, color:C.yellow, textAlign:'right' }}>{Math.round(a.balance||0)}A</span>
      <NeedBar val={a.hunger}  color={C.yellow} />
      <NeedBar val={a.thirst}  color={C.blue}   />
      <NeedBar val={a.shelter} color={C.accent} />
      <span style={{ fontSize:10, color:moodClr }}>{a.mood||'neutral'}</span>
    </div>
  )
}

function MarketRow({ item }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 56px 56px 76px',
      gap:4, alignItems:'center', padding:'7px 0',
      borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        {item._is_new && <span style={{ fontSize:9, background:`${C.green}22`, border:`1px solid ${C.green}44`,
          color:C.green, borderRadius:10, padding:'1px 6px' }}>NEW</span>}
        <span style={{ fontSize:12, color:C.text }}>{item.item}</span>
      </div>
      <span style={{ fontSize:11, color:C.muted, textAlign:'right' }}>{item.supply}</span>
      <span style={{ fontSize:11, color:C.green, textAlign:'right' }}>{item.buy_price?.toFixed(0)}A</span>
      <div style={{ height:4, background:'rgba(255,255,255,0.06)', borderRadius:99 }}>
        <div style={{ height:'100%', borderRadius:99,
          width:`${Math.min(100,(item.supply/200)*100)}%`,
          background:item.supply<15?C.red:item.supply<50?C.yellow:C.green }} />
      </div>
    </div>
  )
}

function TechCard({ tech, onStart, treasury }) {
  const sc = { unlocked:C.green, researching:C.yellow, available:C.blue, locked:C.muted }[tech.status]||C.muted
  const si = { unlocked:'✅', researching:'🔬', available:'💡', locked:'🔒' }[tech.status]||'❓'
  const canStart = tech.status==='available' && treasury >= tech.cost*0.5
  return (
    <div style={{ background:C.panel, border:`1px solid ${sc}33`, borderRadius:12,
      padding:'12px 14px', display:'flex', flexDirection:'column', gap:6,
      opacity:tech.status==='locked'?0.4:1 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <span style={{ fontWeight:700, fontSize:13, color:C.text }}>{si} {tech.name}</span>
        <span style={{ fontSize:10, color:sc, fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>{tech.status}</span>
      </div>
      <div style={{ fontSize:11, color:C.muted, lineHeight:1.5 }}>{tech.description}</div>
      {tech.status==='researching' && (
        <div>
          <div style={{ height:4, background:'rgba(255,255,255,0.08)', borderRadius:99, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${tech.progress}%`,
              background:`linear-gradient(90deg,${C.yellow},${C.accent})`, borderRadius:99 }} />
          </div>
          <div style={{ fontSize:10, color:C.yellow, marginTop:3 }}>{tech.progress}% complete</div>
        </div>
      )}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {tech.unlocks_item && <span style={{ fontSize:10, background:`${C.green}18`, border:`1px solid ${C.green}44`,
          color:C.green, borderRadius:20, padding:'2px 8px' }}>🆕 {tech.unlocks_item}</span>}
        <span style={{ fontSize:10, background:`${C.accent}18`, border:`1px solid ${C.accent}44`,
          color:C.accent, borderRadius:20, padding:'2px 8px' }}>💰 {tech.cost}A</span>
        <span style={{ fontSize:10, background:'rgba(255,255,255,0.05)', color:C.muted,
          borderRadius:20, padding:'2px 8px' }}>👤 {tech.researcher_role}</span>
      </div>
      {tech.requires?.length>0 && <div style={{ fontSize:10, color:C.muted }}>Needs: {tech.requires.join(' + ')}</div>}
      {canStart && (
        <button onClick={()=>onStart(tech.tech_id)} style={{ marginTop:4, padding:'7px 14px',
          background:`${C.accent}22`, border:`1px solid ${C.accent}66`, borderRadius:8,
          color:C.accent, fontSize:12, fontWeight:700, cursor:'pointer' }}>
          Start Research ({Math.ceil(tech.cost*0.5)}A)
        </button>
      )}
      {tech.status==='available' && !canStart && (
        <div style={{ fontSize:10, color:C.red }}>Need {Math.ceil(tech.cost*0.5)}A in treasury</div>
      )}
    </div>
  )
}

export default function AethoriaPanel() {
  const [tab,      setTab]      = useState('overview')
  const [status,   setStatus]   = useState(null)
  const [inv,      setInv]      = useState(null)
  const [market,   setMarket]   = useState([])
  const [agents,   setAgents]   = useState([])
  const [famTree,  setFamTree]  = useState([])
  const [tickMsg,  setTickMsg]  = useState('')
  const [ticking,  setTicking]  = useState(false)
  const [filter,   setFilter]   = useState('')
  const base = `${API}/society`

  const load = useCallback(async () => {
    try {
      const [st, snap, innovations, nm, ft] = await Promise.all([
        fetch(`${API}/status`).then(r=>r.json()).catch(()=>null),
        fetch(`${base}/snapshot`).then(r=>r.json()).catch(()=>null),
        fetch(`${base}/innovations`).then(r=>r.json()).catch(()=>null),
        fetch(`${base}/market/new`).then(r=>r.json()).catch(()=>null),
        fetch(`${base}/family_tree`).then(r=>r.json()).catch(()=>null),
      ])
      setStatus(st)
      setInv(innovations)
      setFamTree(ft?.family_tree||[])
      if (snap) {
        const base_items = snap.market ? Object.entries(snap.market).map(([item,v])=>({
          item, buy_price:v?.buy_price||v, sell_price:v?.sell_price||v,
          supply:v?.supply||100, _is_new:false
        })) : []
        const new_items = (nm?.new_items||[]).map(i=>({...i,_is_new:true}))
        const newKeys   = new Set(new_items.map(i=>i.item))
        setMarket([...new_items, ...base_items.filter(i=>!newKeys.has(i.item))])
        setAgents(snap.agents||[])
      }
    } catch(e) { console.error(e) }
  }, [base])

  useEffect(()=>{ load() },[load])
  useEffect(()=>{ const id=setInterval(load,30000); return()=>clearInterval(id) },[load])

  const advance = async (n) => {
    setTicking(true); setTickMsg(`Running ${n} day${n>1?'s':''}...`)
    try {
      const r = await fetch(`${base}/fast_forward`,{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ticks:n, mc_day_speed:1, announce:n<=7})
      })
      const d = await r.json()
      setTickMsg(`${n}d done — Treasury: ${d.treasury_end?.toFixed(0)}A (${d.treasury_delta>=0?'+':''}${d.treasury_delta?.toFixed(0)}A) · Pop: ${d.population} · Deaths: ${d.total_deaths||0} · Grown: ${d.children_grown||0}`)
      load()
    } catch(e) { setTickMsg('Error: '+e.message) }
    setTicking(false)
  }

  const startResearch = async (techId) => {
    try {
      const r = await fetch(`${base}/research/start`,{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({tech_id:techId, proposed_by:'player'})
      })
      const d = await r.json()
      setTickMsg(d.ok ? `✅ ${d.tech_name} → ${d.researcher} (ETA ${d.eta_days}d)` : `⚠️ ${d.error}`)
      if(d.ok) load()
    } catch(e) { setTickMsg('Failed: '+e.message) }
  }

  const treas  = status?.treasury||0
  const pop    = status?.agents||0
  const dead   = agents.filter(a=>a.is_dead).length
  const desp   = agents.filter(a=>a.mood==='desperate').length
  const kids   = agents.filter(a=>a.is_child).length
  const gen2   = famTree.filter(a=>(a.generation||1)>1).length
  const maxGen = Math.max(1,...famTree.map(a=>a.generation||1))
  const allT   = inv ? [...inv.tier1,...inv.tier2,...inv.tier3] : []
  const TABS   = ['overview','agents','market','tech','family']

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column',
      background:C.bg, color:C.text, fontFamily:"'Inter',sans-serif", overflow:'hidden' }}>

      {/* Sub-nav */}
      <div style={{ display:'flex', borderBottom:`1px solid ${C.border}`,
        background:'rgba(10,10,20,0.95)', flexShrink:0, overflowX:'auto' }}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{
            padding:'10px 16px', border:'none', cursor:'pointer',
            background:tab===t?`${C.accent}18`:'transparent',
            color:tab===t?C.accent:C.muted, fontWeight:tab===t?700:400,
            fontSize:12, textTransform:'capitalize',
            borderBottom:tab===t?`2px solid ${C.accent}`:'2px solid transparent',
            whiteSpace:'nowrap' }}>{t}</button>
        ))}
        <button onClick={load} style={{ marginLeft:'auto', padding:'10px 16px',
          border:'none', background:'transparent', color:C.muted, cursor:'pointer', fontSize:14 }}>⟳</button>
      </div>

      {/* Ticker */}
      {tickMsg && (
        <div style={{ padding:'7px 16px', fontSize:11, flexShrink:0,
          background:tickMsg.startsWith('Error')?`${C.red}18`:`${C.accent}12`,
          color:tickMsg.startsWith('Error')?C.red:C.accent,
          borderBottom:`1px solid ${C.border}` }}>
          {ticking?'⏳ ':''}{tickMsg}
        </div>
      )}

      <div style={{ flex:1, overflowY:'auto', padding:16 }}>

        {/* OVERVIEW */}
        {tab==='overview' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <StatCard icon="👥" label="Population" value={pop}                   color={C.green}  />
              <StatCard icon="💰" label="Treasury"   value={`${treas?.toFixed(0)}A`} color={C.yellow} />
              <StatCard icon="🧬" label="Max Gen"    value={`Gen ${maxGen}`} sub={`${gen2} descendants`} color={C.accent} />
              <StatCard icon="👶" label="Children"   value={kids}                  color={C.blue}   />
            </div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <StatCard icon="🔬" label="Researching" value={inv?.in_research||0} sub={`${inv?.total_unlocked||0} unlocked`} color={C.yellow} />
              <StatCard icon="🆕" label="New Markets"  value={market.filter(i=>i._is_new).length} color={C.green} />
              <StatCard icon="😰" label="Desperate"   value={desp} color={desp>0?C.red:C.muted} />
              <StatCard icon="☠️" label="Deaths"      value={dead} color={dead>0?C.red:C.muted} />
            </div>

            {/* Time controls */}
            <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:14, padding:'14px 16px' }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:10 }}>⏩ Advance Time</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {[1,7,30,90,365].map(n=>(
                  <button key={n} onClick={()=>advance(n)} disabled={ticking} style={{
                    padding:'8px 18px', border:`1px solid ${C.accent}55`, borderRadius:8,
                    background:`${C.accent}15`, color:ticking?C.muted:C.accent,
                    fontWeight:700, fontSize:13, cursor:ticking?'default':'pointer' }}>+{n}d</button>
                ))}
              </div>
            </div>

            {/* Active research */}
            <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:14, padding:'14px 16px' }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:10 }}>🔬 Active Research</div>
              {allT.filter(t=>t.status==='researching').length===0
                ? <div style={{ color:C.muted, fontSize:12 }}>No active research — go to Tech tab</div>
                : allT.filter(t=>t.status==='researching').map(t=>(
                  <div key={t.tech_id} style={{ marginBottom:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <span style={{ fontSize:12, fontWeight:600 }}>🔬 {t.name}</span>
                      <span style={{ fontSize:11, color:C.yellow }}>{t.progress}%  → {t.unlocks_item}</span>
                    </div>
                    <div style={{ height:5, background:'rgba(255,255,255,0.08)', borderRadius:99 }}>
                      <div style={{ height:'100%', width:`${t.progress}%`,
                        background:`linear-gradient(90deg,${C.yellow},${C.accent})`, borderRadius:99 }} />
                    </div>
                  </div>
                ))
              }
            </div>

            {/* New market unlocks */}
            {market.filter(i=>i._is_new).length>0 && (
              <div style={{ background:`${C.green}10`, border:`1px solid ${C.green}33`,
                borderRadius:14, padding:'14px 16px' }}>
                <div style={{ fontWeight:700, fontSize:13, color:C.green, marginBottom:8 }}>🆕 Innovation Unlocks</div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {market.filter(i=>i._is_new).map(i=>(
                    <div key={i.item} style={{ background:`${C.green}15`, border:`1px solid ${C.green}44`,
                      borderRadius:10, padding:'8px 12px' }}>
                      <div style={{ fontWeight:700, fontSize:13 }}>{i.item}</div>
                      <div style={{ fontSize:11, color:C.green }}>{i.buy_price?.toFixed(0)}A · {i.supply} in stock</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Food warning */}
            {market.filter(i=>['bread','food_ration'].includes(i.item)&&(i.supply||0)<20).length>0 && (
              <div style={{ background:`${C.red}15`, border:`1px solid ${C.red}44`,
                borderRadius:12, padding:'12px 14px' }}>
                <span style={{ fontSize:13, fontWeight:700, color:C.red }}>⚠️ Food shortage! Citizens may starve.</span>
              </div>
            )}
          </div>
        )}

        {/* AGENTS */}
        {tab==='agents' && (
          <div>
            <input placeholder="Filter name or role..." value={filter}
              onChange={e=>setFilter(e.target.value)} style={{
                width:'100%', marginBottom:12, padding:'9px 14px',
                background:C.panel, border:`1px solid ${C.border}`, borderRadius:10,
                color:C.text, fontSize:13, boxSizing:'border-box' }} />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 76px 64px repeat(3,50px) 58px',
              gap:4, padding:'0 0 6px', borderBottom:`1px solid ${C.border}` }}>
              {['Name','Role','Bal','🍞','💧','🏠','Mood'].map(h=>(
                <span key={h} style={{ fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:1 }}>{h}</span>
              ))}
            </div>
            {agents
              .filter(a=>!filter||a.name?.toLowerCase().includes(filter.toLowerCase())||a.role?.toLowerCase().includes(filter.toLowerCase()))
              .sort((a,b)=>(b.balance||0)-(a.balance||0))
              .map(a=><AgentRow key={a.agent_id||a.name} a={a} />)
            }
          </div>
        )}

        {/* MARKET */}
        {tab==='market' && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 56px 56px 76px',
              gap:4, padding:'0 0 8px', borderBottom:`1px solid ${C.border}`, marginBottom:4 }}>
              {['Item','Supply','Buy','Stock Level'].map(h=>(
                <span key={h} style={{ fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:1 }}>{h}</span>
              ))}
            </div>
            {market.sort((a,b)=>(b._is_new?1:0)-(a._is_new?1:0)||a.item.localeCompare(b.item))
              .map(i=><MarketRow key={i.item} item={i} />)}
            {market.length===0 && <div style={{ color:C.muted, fontSize:12, textAlign:'center', marginTop:40 }}>Loading...</div>}
          </div>
        )}

        {/* TECH */}
        {tab==='tech' && inv && (
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              {[['✅','Unlocked',inv.total_unlocked,C.green],
                ['🔬','Researching',inv.in_research,C.yellow],
                ['💡','Available',inv.total_available,C.blue]].map(([icon,lbl,val,clr])=>(
                <div key={lbl} style={{ background:C.panel, border:`1px solid ${clr}33`,
                  borderRadius:12, padding:'10px 16px', display:'flex', gap:8, alignItems:'center' }}>
                  <span style={{ fontSize:20 }}>{icon}</span>
                  <div>
                    <div style={{ fontWeight:800, fontSize:18, color:clr }}>{val}</div>
                    <div style={{ fontSize:10, color:C.muted }}>{lbl}</div>
                  </div>
                </div>
              ))}
            </div>
            {[['🔨 Tier 1 — Foundations',inv.tier1],
              ['⚙️  Tier 2 — Industrial', inv.tier2],
              ['✨  Tier 3 — Advanced',   inv.tier3]].map(([title,techs])=>(
              <div key={title}>
                <div style={{ fontWeight:700, fontSize:12, color:C.muted,
                  textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>{title}</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))', gap:10 }}>
                  {techs.map(t=><TechCard key={t.tech_id} tech={t} onStart={startResearch} treasury={treas} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* FAMILY */}
        {tab==='family' && (
          <div>
            <div style={{ marginBottom:14, fontSize:12, color:C.muted }}>
              {famTree.length} agents · {gen2} descendants · Max gen {maxGen}
            </div>
            {[...new Set(famTree.map(a=>a.generation||1))].sort().map(gen=>{
              const g = famTree.filter(a=>(a.generation||1)===gen)
              return (
                <div key={gen} style={{ marginBottom:20 }}>
                  <div style={{ fontWeight:700, fontSize:12, color:C.accent,
                    textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>
                    Generation {gen} ({g.length})
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                    {g.map(a=>(
                      <div key={a.agent_id||a.name} style={{ background:C.panel,
                        border:`1px solid ${a.is_child?C.blue:C.border}44`,
                        borderRadius:10, padding:'8px 12px', minWidth:130 }}>
                        <div style={{ fontWeight:700, fontSize:13 }}>{a.is_child?'👶 ':''}{a.name}</div>
                        <div style={{ fontSize:11, color:C.muted }}>{a.role}</div>
                        {(a.parent1_name||a.parent2_name) && (
                          <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>
                            ← {a.parent1_name} + {a.parent2_name}
                          </div>
                        )}
                        {a.partner_name && (
                          <div style={{ fontSize:10, color:C.pink, marginTop:2 }}>💑 {a.partner_name}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
