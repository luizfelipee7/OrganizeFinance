'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type View = 'home' | 'agenda' | 'people' | 'banks';
type InvoiceStatus = 'open' | 'closed' | 'paid';
type Debt = { id: string; title: string; totalAmount: number; installments: number; dueDay: number; startMonth: string; paidInstallments: number[] };
type Person = { id: string; name: string; photo?: string; color: string; debts: Debt[] };
type Invoice = { id: string; month: string; value: number; status: InvoiceStatus };
type Card = { id: string; name: string; dueDay: number; closingDay: number; invoices: Invoice[] };
type CreditLine = { id: string; product: string; totalAmount: number; installmentAmount?: number; installments: number; firstDueDate: string; paidInstallments: number[] };
type Bank = { id: string; name: string; photo?: string; color: string; cards: Card[]; creditLines: CreditLine[] };
type MonthItem = { id: string; name: string; photo?: string; detail: string; invoiceStatus?: InvoiceStatus; dueDay: number; closingDay?: number; value: number; paid: boolean; color: string; kind: 'person' | 'bank'; entityId: string };

const COLORS = ['#6551e8', '#3285d5', '#f07b3f', '#25a477', '#e95476', '#8357c5'];
const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = { open: 'Em aberto', closed: 'Fechada', paid: 'Paga' };
const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const moneyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fullDateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const LEGACY_PERSON_IDS = new Set(['p1', 'p2']);
const LEGACY_BANK_IDS = new Set(['b1', 'b2']);

function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
function monthDate(key: string) { const [year, month] = key.split('-').map(Number); return new Date(year, month - 1, 1); }
function monthLabel(key: string) { const label = monthFormatter.format(monthDate(key)); return label.charAt(0).toUpperCase() + label.slice(1); }
function monthYearLabel(key: string) { const [year, month] = key.split('-'); return `${month}/${year}`; }
function shiftMonth(key: string, amount: number) { const date = monthDate(key); date.setMonth(date.getMonth() + amount); return monthKey(date); }
function installmentDueDate(line: CreditLine, number: number) {
  const [year, month, day] = line.firstDueDate.split('-').map(Number);
  const target = new Date(year, month - 1 + number - 1, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}
function fullDateLabel(date: Date) { return fullDateFormatter.format(date); }
function automaticInvoiceStatus(card: Card, invoiceMonth: string, today = new Date()): 'open' | 'closed' {
  const currentMonth = monthKey(today);
  if (invoiceMonth < currentMonth) return 'closed';
  if (invoiceMonth > currentMonth) return 'open';
  return today.getDate() >= card.closingDay ? 'closed' : 'open';
}
function invoiceStatus(invoice: Invoice, card: Card, today = new Date()): InvoiceStatus { return invoice.status === 'paid' ? 'paid' : automaticInvoiceStatus(card, invoice.month, today); }
function monthDiff(start: string, current: string) {
  const [sy, sm] = start.split('-').map(Number); const [cy, cm] = current.split('-').map(Number);
  return (cy - sy) * 12 + cm - sm;
}
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(); }
function uid(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function parseMoney(value: string) { return Number(value.replace(/\./g, '').replace(',', '.')) || 0; }
function creditInstallmentValue(line: CreditLine) { return line.installmentAmount && line.installmentAmount > 0 ? line.installmentAmount : line.totalAmount / line.installments; }
function creditInterestValue(line: CreditLine) { return Math.max(0, creditInstallmentValue(line) * line.installments - line.totalAmount); }
function normalizeBank(raw: Partial<Bank> & { dueDay?: number; closingDay?: number; invoices?: Invoice[] }): Bank {
  const id = raw.id ?? uid('bank');
  const hasLegacyCard = raw.dueDay !== undefined || raw.closingDay !== undefined || Array.isArray(raw.invoices);
  return {
    id,
    name: raw.name ?? 'Banco',
    photo: raw.photo,
    color: raw.color ?? COLORS[0],
    cards: Array.isArray(raw.cards) ? raw.cards : hasLegacyCard ? [{ id: `card-${id}`, name: 'Cartão principal', dueDay: raw.dueDay ?? 10, closingDay: raw.closingDay ?? 3, invoices: raw.invoices ?? [] }] : [],
    creditLines: Array.isArray(raw.creditLines) ? raw.creditLines : [],
  };
}

function Avatar({ name, photo, color, large = false }: { name: string; photo?: string; color: string; large?: boolean }) {
  return <div className={`entity-avatar ${large ? 'large' : ''}`} style={{ background: color }}>{photo ? <img src={photo} alt="" /> : initials(name)}</div>;
}

function Modal({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button className="modal-close" onClick={onClose} aria-label="Fechar">×</button>
      <span className="overline">{title.startsWith('Editar') ? 'EDITAR CADASTRO' : 'NOVO CADASTRO'}</span>
      <h2 id="modal-title">{title}</h2>{subtitle && <p className="modal-subtitle">{subtitle}</p>}
      {children}
    </section>
  </div>;
}

export default function Home() {
  const [view, setView] = useState<View>('home');
  const [selectedMonth, setSelectedMonth] = useState(monthKey());
  const [people, setPeople] = useState<Person[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  const [modal, setModal] = useState<'person' | 'bank' | 'debt' | 'card' | 'invoice' | 'credit' | null>(null);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editingCreditLine, setEditingCreditLine] = useState<CreditLine | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [invoiceMonthToEdit, setInvoiceMonthToEdit] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState('');
  const [systemDate, refreshSystemDate] = useState(() => new Date());

  useEffect(() => {
    try {
      const saved = localStorage.getItem('organiza-data-v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        setPeople((parsed.people ?? []).filter((person: Person) => !LEGACY_PERSON_IDS.has(person.id)));
        setBanks((parsed.banks ?? []).filter((bank: Bank) => !LEGACY_BANK_IDS.has(bank.id)).map(normalizeBank));
      }
    } catch { /* inicia com a área de cadastros vazia */ }
    setHydrated(true);
  }, []);

  useEffect(() => { if (hydrated) localStorage.setItem('organiza-data-v1', JSON.stringify({ people, banks })); }, [people, banks, hydrated]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2600); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { const timer = setInterval(() => refreshSystemDate(new Date()), 60_000); return () => clearInterval(timer); }, []);

  const selectedPerson = people.find(person => person.id === selectedPersonId) ?? null;
  const selectedBank = banks.find(bank => bank.id === selectedBankId) ?? null;
  const selectedCard = selectedBank?.cards.find(card => card.id === selectedCardId) ?? null;

  const monthItems = useMemo(() => {
    const items: MonthItem[] = [];
    people.forEach(person => person.debts.forEach(debt => {
      const index = monthDiff(debt.startMonth, selectedMonth);
      if (index >= 0 && index < debt.installments) items.push({ id: debt.id, name: person.name, photo: person.photo, detail: `${debt.title} · parcela ${index + 1} de ${debt.installments}`, dueDay: debt.dueDay, value: debt.totalAmount / debt.installments, paid: debt.paidInstallments.includes(index + 1), color: person.color, kind: 'person', entityId: person.id });
    }));
    banks.forEach(bank => {
      bank.cards.forEach(card => {
        const invoice = card.invoices.find(item => item.month === selectedMonth);
        if (invoice) { const status = invoiceStatus(invoice, card, systemDate); items.push({ id: invoice.id, name: bank.name, photo: bank.photo, detail: card.name, invoiceStatus: status, dueDay: card.dueDay, closingDay: card.closingDay, value: invoice.value, paid: status === 'paid', color: bank.color, kind: 'bank', entityId: bank.id }); }
      });
      bank.creditLines.forEach(line => {
        const index = monthDiff(line.firstDueDate.slice(0, 7), selectedMonth);
        if (index >= 0 && index < line.installments) { const dueDate = installmentDueDate(line, index + 1); items.push({ id: `${line.id}-${index + 1}`, name: bank.name, photo: bank.photo, detail: `${line.product} · linha de crédito · parcela ${index + 1} de ${line.installments}`, dueDay: dueDate.getDate(), value: creditInstallmentValue(line), paid: line.paidInstallments.includes(index + 1), color: bank.color, kind: 'bank', entityId: bank.id }); }
      });
    });
    return items.sort((a, b) => a.dueDay - b.dueDay);
  }, [people, banks, selectedMonth, systemDate]);

  const total = monthItems.reduce((sum, item) => sum + item.value, 0);
  const paid = monthItems.filter(item => item.paid).reduce((sum, item) => sum + item.value, 0);
  const open = total - paid;
  const paidPercent = total ? Math.round((paid / total) * 100) : 0;

  function goTo(next: View) { setView(next); setSelectedPersonId(null); setSelectedBankId(null); }
  function openItem(item: (typeof monthItems)[number]) {
    if (item.kind === 'person') { setView('people'); setSelectedPersonId(item.entityId); }
    else { setView('banks'); setSelectedBankId(item.entityId); }
  }
  function notify(message: string) { setToast(message); }
  function addPerson() { setEditingPerson(null); setModal('person'); }
  function addBank() { setEditingBank(null); setModal('bank'); }
  function editPerson(person: Person) { setEditingPerson(person); setModal('person'); }
  function editBank(bank: Bank) { setEditingBank(bank); setModal('bank'); }
  function addDebt() { setEditingDebt(null); setModal('debt'); }
  function editDebt(debt: Debt) { setEditingDebt(debt); setModal('debt'); }
  function addCard() { setEditingCard(null); setModal('card'); }
  function editCard(card: Card) { setEditingCard(card); setModal('card'); }
  function addCreditLine() { setEditingCreditLine(null); setModal('credit'); }
  function editCreditLine(line: CreditLine) { setEditingCreditLine(line); setModal('credit'); }
  function deleteCreditLine(line: CreditLine) {
    if (!selectedBank || !window.confirm(`Excluir a linha de crédito “${line.product}” e todo o histórico de parcelas?`)) return;
    setBanks(old => old.map(bank => bank.id === selectedBank.id ? { ...bank, creditLines: bank.creditLines.filter(item => item.id !== line.id) } : bank));
    notify('Linha de crédito excluída.');
  }
  function deleteCard(card: Card) {
    if (!selectedBank || !window.confirm(`Excluir o cartão “${card.name}” e todas as faturas dele?`)) return;
    setBanks(old => old.map(bank => bank.id === selectedBank.id ? { ...bank, cards: bank.cards.filter(item => item.id !== card.id) } : bank));
    notify('Cartão excluído.');
  }
  function openInvoice(card: Card, invoiceMonth = selectedMonth) { setSelectedCardId(card.id); setInvoiceMonthToEdit(invoiceMonth); setModal('invoice'); }
  function deleteDebt(debt: Debt) {
    if (!selectedPerson || !window.confirm(`Excluir a dívida “${debt.title}” e todo o histórico de parcelas?`)) return;
    setPeople(old => old.map(person => person.id === selectedPerson.id ? { ...person, debts: person.debts.filter(item => item.id !== debt.id) } : person));
    notify('Dívida excluída.');
  }
  function deletePerson(person: Person) {
    if (!window.confirm(`Excluir o card de ${person.name} e todas as dívidas dele?`)) return;
    setPeople(old => old.filter(item => item.id !== person.id));
    notify('Pessoa excluída.');
  }
  function deleteBank(bank: Bank) {
    if (!window.confirm(`Excluir o card do ${bank.name}, as faturas e as linhas de crédito?`)) return;
    setBanks(old => old.filter(item => item.id !== bank.id));
    notify('Banco excluído.');
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <button className="brand-mark" onClick={() => goTo('home')} aria-label="Organiza — início">o</button>
      <nav className="nav-list" aria-label="Navegação principal">
        <button onClick={() => goTo('home')} className={`nav-item ${view === 'home' ? 'active' : ''}`}><span>⌂</span><small>Início</small></button>
        <button onClick={() => goTo('agenda')} className={`nav-item ${view === 'agenda' ? 'active' : ''}`}><span>▦</span><small>Agenda</small></button>
        <button onClick={() => goTo('people')} className={`nav-item ${view === 'people' ? 'active' : ''}`}><span>♙</span><small>Pessoas</small></button>
        <button onClick={() => goTo('banks')} className={`nav-item ${view === 'banks' ? 'active' : ''}`}><span>▤</span><small>Bancos</small></button>
      </nav>
      <button className="nav-item settings" onClick={() => notify('Configurações chegam na próxima versão.')} aria-label="Configurações"><span>⚙</span></button>
    </aside>

    <section className="workspace">
      <header className="topbar">
        <div>
          <p className="eyebrow">{view === 'home' ? 'VISÃO GERAL' : view === 'agenda' ? 'CALENDÁRIO FINANCEIRO' : view === 'people' ? 'MINHAS DÍVIDAS' : 'MINHAS FATURAS'}</p>
          <h1>{view === 'home' ? <>Olá! <span>👋</span></> : view === 'agenda' ? 'Agenda' : view === 'people' ? 'Pessoas' : 'Bancos'}</h1>
        </div>
        <div className="top-actions">
          <label className="month-picker"><span>Mês</span><input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} /></label>
          <div className="avatar">O</div>
        </div>
      </header>

      {view === 'home' && <Dashboard month={selectedMonth} onMonthChange={setSelectedMonth} total={total} paid={paid} open={open} percent={paidPercent} items={monthItems} openItem={openItem} onAddPerson={addPerson} onAddBank={addBank} goTo={goTo} />}
      {view === 'agenda' && <AgendaView month={selectedMonth} onMonthChange={setSelectedMonth} total={total} paid={paid} open={open} items={monthItems} openItem={openItem} />}
      {view === 'people' && <PeopleView people={people} selected={selectedPerson} month={selectedMonth} onSelect={setSelectedPersonId} onBack={() => setSelectedPersonId(null)} onAdd={addPerson} onAddDebt={addDebt} onEditDebt={editDebt} onDeleteDebt={deleteDebt} onEdit={editPerson} onDelete={deletePerson} setPeople={setPeople} notify={notify} />}
      {view === 'banks' && <BanksView banks={banks} selected={selectedBank} month={selectedMonth} onSelect={setSelectedBankId} onBack={() => setSelectedBankId(null)} onAdd={addBank} onAddCard={addCard} onAddCreditLine={addCreditLine} onEditCreditLine={editCreditLine} onDeleteCreditLine={deleteCreditLine} onEditCard={editCard} onDeleteCard={deleteCard} onInvoice={openInvoice} onEdit={editBank} onDelete={deleteBank} setBanks={setBanks} notify={notify} />}
    </section>

    {modal === 'person' && <PersonForm existing={editingPerson} onClose={() => { setModal(null); setEditingPerson(null); }} onSave={person => { const wasEditing = Boolean(editingPerson); setPeople(old => wasEditing ? old.map(item => item.id === person.id ? person : item) : [...old, person]); setModal(null); setEditingPerson(null); setView('people'); notify(wasEditing ? 'Pessoa atualizada.' : 'Pessoa adicionada com sucesso.'); }} />}
    {modal === 'bank' && <BankForm existing={editingBank} onClose={() => { setModal(null); setEditingBank(null); }} onSave={bank => { const wasEditing = Boolean(editingBank); setBanks(old => wasEditing ? old.map(item => item.id === bank.id ? bank : item) : [...old, bank]); setModal(null); setEditingBank(null); setView('banks'); notify(wasEditing ? 'Banco atualizado.' : 'Banco adicionado com sucesso.'); }} />}
    {modal === 'debt' && selectedPerson && <DebtForm month={selectedMonth} personName={selectedPerson.name} existing={editingDebt} onClose={() => { setModal(null); setEditingDebt(null); }} onSave={debt => { const wasEditing = Boolean(editingDebt); setPeople(old => old.map(person => person.id === selectedPerson.id ? { ...person, debts: wasEditing ? person.debts.map(item => item.id === debt.id ? debt : item) : [...person.debts, debt] } : person)); setModal(null); setEditingDebt(null); notify(wasEditing ? 'Dívida atualizada.' : 'Dívida adicionada.'); }} />}
    {modal === 'card' && selectedBank && <CardForm existing={editingCard} bankName={selectedBank.name} onClose={() => { setModal(null); setEditingCard(null); }} onSave={card => { const wasEditing = Boolean(editingCard); setBanks(old => old.map(bank => bank.id === selectedBank.id ? { ...bank, cards: wasEditing ? bank.cards.map(item => item.id === card.id ? card : item) : [...bank.cards, card] } : bank)); setModal(null); setEditingCard(null); notify(wasEditing ? 'Cartão atualizado.' : 'Cartão adicionado.'); }} />}
    {modal === 'invoice' && selectedBank && selectedCard && <InvoiceForm month={invoiceMonthToEdit ?? selectedMonth} bankName={selectedBank.name} card={selectedCard} onClose={() => { setModal(null); setSelectedCardId(null); setInvoiceMonthToEdit(null); }} onSave={invoice => { setBanks(old => old.map(bank => bank.id === selectedBank.id ? { ...bank, cards: bank.cards.map(card => card.id === selectedCard.id ? { ...card, invoices: [...card.invoices.filter(item => item.month !== invoice.month), invoice] } : card) } : bank)); setModal(null); setSelectedCardId(null); setInvoiceMonthToEdit(null); notify('Fatura salva.'); }} />}
    {modal === 'credit' && selectedBank && <CreditLineForm month={selectedMonth} bankName={selectedBank.name} existing={editingCreditLine} onClose={() => { setModal(null); setEditingCreditLine(null); }} onSave={line => { const wasEditing = Boolean(editingCreditLine); setBanks(old => old.map(bank => bank.id === selectedBank.id ? { ...bank, creditLines: wasEditing ? bank.creditLines.map(item => item.id === line.id ? line : item) : [...bank.creditLines, line] } : bank)); setModal(null); setEditingCreditLine(null); notify(wasEditing ? 'Linha de crédito atualizada.' : 'Linha de crédito adicionada.'); }} />}
    {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
  </main>;
}

function Dashboard({ month, onMonthChange, total, paid, open, percent, items, openItem, onAddPerson, onAddBank, goTo }: { month: string; onMonthChange: (month: string) => void; total: number; paid: number; open: number; percent: number; items: MonthItem[]; openItem: (item: MonthItem) => void; onAddPerson: () => void; onAddBank: () => void; goTo: (view: View) => void }) {
  return <div className="content">
    <section className="hero-grid">
      <article className="balance-card">
        <div className="balance-top"><label className="pill-light balance-month-picker" title="Selecionar outro mês"><span>{monthLabel(month).toUpperCase()}</span><b>⌄</b><input type="month" value={month} onChange={event => onMonthChange(event.target.value)} aria-label="Selecionar mês para calcular o total" /></label><span className="balance-symbol">↗</span></div>
        <p>Total a pagar no mês</p><h2>{moneyFormatter.format(total)}</h2>
        <div className="progress-track"><span style={{ width: `${percent}%` }} /></div>
        <div className="progress-labels"><span>{percent}% pago</span><span>{moneyFormatter.format(open)} restantes</span></div>
        <div className="orb orb-one" /><div className="orb orb-two" />
      </article>
      <article className="quick-card">
        <div className="section-title"><div><span className="overline">RESUMO</span><h3>Seu mês em números</h3></div></div>
        <div className="metric-row"><div className="metric-icon coral">↓</div><div><small>Contas em aberto</small><strong>{items.filter(i => !i.paid).length}</strong></div><span className="metric-value">{moneyFormatter.format(open)}</span></div>
        <div className="metric-row"><div className="metric-icon mint">✓</div><div><small>Contas pagas</small><strong>{items.filter(i => i.paid).length}</strong></div><span className="metric-value">{moneyFormatter.format(paid)}</span></div>
      </article>
    </section>
    <section className="main-grid">
      <article className="panel upcoming-panel">
        <div className="section-title"><div><span className="overline">AGENDA</span><h3>Pagamentos de {monthLabel(month).split(' de ')[0]}</h3></div></div>
        {items.length ? <div className="payment-list">{items.slice(0, 5).map(item => <button className="payment-row" key={`${item.kind}-${item.id}`} onClick={() => openItem(item)}>
          <div className="company-logo" style={{ background: `${item.color}18`, color: item.color }}>{item.photo ? <img src={item.photo} alt={`Foto de ${item.name}`} /> : item.kind === 'bank' ? '▤' : initials(item.name)}</div>
          <div className="payment-info"><strong>{item.name}</strong><small>{item.detail}{item.invoiceStatus && ` · ${INVOICE_STATUS_LABELS[item.invoiceStatus].toLowerCase()}`}</small></div>
          <span className="date-badge">dia {item.dueDay}</span><strong className="amount">{moneyFormatter.format(item.value)}</strong><span className={`status-dot ${item.paid ? 'done' : ''}`}>{item.paid ? '✓' : '•'}</span>
        </button>)}</div> : <EmptyMini />}
      </article>
      <article className="panel action-panel"><span className="overline">ATALHOS</span><h3>O que você quer<br />organizar?</h3>
        <button className="add-action" onClick={onAddPerson}><span>＋</span><div><strong>Nova pessoa</strong><small>Registre uma dívida</small></div><b>›</b></button>
        <button className="add-action" onClick={onAddBank}><span>＋</span><div><strong>Novo banco</strong><small>Organize suas faturas</small></div><b>›</b></button>
      </article>
    </section>
    <section className="insight-strip"><div className="insight-icon">✦</div><div><span className="overline">INSIGHT DO MÊS</span><p>{percent ? <>Você já pagou <strong>{percent}% das suas contas.</strong> Continue assim!</> : <>Comece marcando uma conta como paga e acompanhe seu progresso.</>}</p></div><button onClick={() => goTo('people')}>Ver detalhes</button></section>
  </div>;
}

function AgendaView({ month, onMonthChange, total, paid, open, items, openItem }: { month: string; onMonthChange: (month: string) => void; total: number; paid: number; open: number; items: MonthItem[]; openItem: (item: MonthItem) => void }) {
  const peopleItems = items.filter(item => item.kind === 'person');
  const bankItems = items.filter(item => item.kind === 'bank');
  return <div className="content agenda-page">
    <section className="agenda-toolbar"><div><span className="overline">TODOS OS COMPROMISSOS</span><h2>Agenda de pagamentos</h2><p>Veja tudo o que vence em {monthLabel(month)}.</p></div><label className="agenda-month-control"><span>Escolher mês</span><input type="month" value={month} onChange={event => onMonthChange(event.target.value)} /></label></section>
    <section className="agenda-summary"><article><span>Total do mês</span><strong>{moneyFormatter.format(total)}</strong><small>{items.length} {items.length === 1 ? 'pagamento' : 'pagamentos'}</small></article><article className="open"><span>Ainda falta pagar</span><strong>{moneyFormatter.format(open)}</strong><small>{items.filter(item => !item.paid).length} em aberto</small></article><article className="paid"><span>Já foi pago</span><strong>{moneyFormatter.format(paid)}</strong><small>{items.filter(item => item.paid).length} concluídos</small></article></section>
    <div className="agenda-groups">
      <AgendaGroup overline="PESSOAS" title="Dívidas com pessoas" items={peopleItems} emptyText="Nenhum pagamento para pessoas neste mês." openItem={openItem} />
      <AgendaGroup overline="BANCOS" title="Faturas e linhas de crédito" items={bankItems} emptyText="Nenhum pagamento para bancos neste mês." openItem={openItem} />
    </div>
  </div>;
}

function AgendaGroup({ overline, title, items, emptyText, openItem }: { overline: string; title: string; items: MonthItem[]; emptyText: string; openItem: (item: MonthItem) => void }) {
  const subtotal = items.reduce((sum, item) => sum + item.value, 0);
  return <section className="panel agenda-full-panel agenda-group">
    <div className="section-title"><div><span className="overline">{overline}</span><h3>{title}</h3></div><div className="agenda-group-total"><small>{items.length} {items.length === 1 ? 'pagamento' : 'pagamentos'}</small><strong>{moneyFormatter.format(subtotal)}</strong></div></div>
    {items.length ? <div className="payment-list agenda-list">{items.map(item => <button className="payment-row" key={`${item.kind}-${item.id}`} onClick={() => openItem(item)}>
      <div className="company-logo" style={{ background: `${item.color}18`, color: item.color }}>{item.photo ? <img src={item.photo} alt={`Foto de ${item.name}`} /> : item.kind === 'bank' ? '▤' : initials(item.name)}</div>
      <div className="payment-info agenda-payment-info">
        <strong>{item.name}</strong>
        <div className="payment-detail-line">
          <small className="payment-subtitle">{item.detail}</small>
          {item.invoiceStatus && <span className={`agenda-payment-status ${item.invoiceStatus}`}>{INVOICE_STATUS_LABELS[item.invoiceStatus]}</span>}
          {item.kind === 'person' && <span className={`agenda-payment-status ${item.paid ? 'paid' : 'open'}`}>{item.paid ? 'Paga' : 'Em aberto'}</span>}
        </div>
      </div>
      <div className="agenda-date">{item.kind === 'bank' && item.closingDay && <span className="date-badge closing-badge">Fecha dia {item.closingDay}</span>}<span className="date-badge">{item.kind === 'bank' ? `Vence dia ${item.dueDay}` : `dia ${item.dueDay}`}</span></div>
      <strong className="amount">{moneyFormatter.format(item.value)}</strong><span className={`status-dot ${item.paid ? 'done' : ''}`}>{item.paid ? '✓' : '•'}</span>
    </button>)}</div> : <div className="agenda-group-empty">{emptyText}</div>}
  </section>;
}

function PeopleView({ people, selected, month, onSelect, onBack, onAdd, onAddDebt, onEditDebt, onDeleteDebt, onEdit, onDelete, setPeople, notify }: { people: Person[]; selected: Person | null; month: string; onSelect: (id: string) => void; onBack: () => void; onAdd: () => void; onAddDebt: () => void; onEditDebt: (debt: Debt) => void; onDeleteDebt: (debt: Debt) => void; onEdit: (person: Person) => void; onDelete: (person: Person) => void; setPeople: React.Dispatch<React.SetStateAction<Person[]>>; notify: (message: string) => void }) {
  if (selected) return <div className="content detail-page">
    <button className="back-button" onClick={onBack}>← Voltar para pessoas</button>
    <section className="detail-hero"><Avatar name={selected.name} photo={selected.photo} color={selected.color} large /><div><span className="overline">PESSOA</span><h2>{selected.name}</h2><p>{selected.debts.length} {selected.debts.length === 1 ? 'dívida cadastrada' : 'dívidas cadastradas'}</p></div><button className="primary-button" onClick={onAddDebt}>＋ Nova dívida</button></section>
    <div className="detail-heading"><div><span className="overline">ACOMPANHAMENTO</span><h3>Dívidas e parcelas</h3></div></div>
    <section className="debt-stack">{selected.debts.length ? selected.debts.map(debt => <DebtCard key={debt.id} debt={debt} month={month} onEdit={() => onEditDebt(debt)} onDelete={() => onDeleteDebt(debt)} onToggle={installment => { setPeople(old => old.map(person => person.id === selected.id ? { ...person, debts: person.debts.map(item => item.id === debt.id ? { ...item, paidInstallments: item.paidInstallments.includes(installment) ? item.paidInstallments.filter(n => n !== installment) : [...item.paidInstallments, installment] } : item) } : person)); notify(debt.paidInstallments.includes(installment) ? 'Parcela reaberta.' : 'Parcela marcada como paga.'); }} />) : <EmptyState icon="◎" title="Nenhuma dívida por aqui" text="Cadastre a primeira dívida para acompanhar as parcelas." action="Adicionar dívida" onAction={onAddDebt} />}</section>
  </div>;

  return <div className="content listing-page"><div className="listing-heading"><div><span className="overline">QUEM VOCÊ PRECISA PAGAR</span><h2>Suas pessoas</h2><p>Acompanhe cada dívida e saiba exatamente o que ainda falta.</p></div><button className="primary-button" onClick={onAdd}>＋ Nova pessoa</button></div>
    {people.length ? <section className="entity-grid">{people.map(person => {
      const total = person.debts.reduce((sum, d) => sum + d.totalAmount, 0); const paid = person.debts.reduce((sum, d) => sum + d.paidInstallments.length * (d.totalAmount / d.installments), 0); const monthOpen = person.debts.reduce((sum, debt) => { const index = monthDiff(debt.startMonth, month); return index >= 0 && index < debt.installments && !debt.paidInstallments.includes(index + 1) ? sum + debt.totalAmount / debt.installments : sum; }, 0);
      return <article className="entity-card person-card" key={person.id} role="button" tabIndex={0} onClick={() => onSelect(person.id)} onKeyDown={event => { if (event.key === 'Enter' && event.target === event.currentTarget) onSelect(person.id); }}><div className="entity-top"><Avatar name={person.name} photo={person.photo} color={person.color} /><CardActions name={person.name} onEdit={() => onEdit(person)} onDelete={() => onDelete(person)} /></div><h3>{person.name}</h3><p>{person.debts.length} {person.debts.length === 1 ? 'dívida ativa' : 'dívidas ativas'}</p><div className="person-card-values"><div><small>A pagar em {monthLabel(month).split(' de ')[0]}</small><strong>{moneyFormatter.format(monthOpen)}</strong></div><div><small>Saldo restante</small><strong>{moneyFormatter.format(Math.max(0, total - paid))}</strong></div></div><div className="mini-progress"><span style={{ width: `${total ? (paid / total) * 100 : 0}%` }} /></div></article>;
    })}<button className="entity-card new-entity" onClick={onAdd}><span>＋</span><strong>Adicionar pessoa</strong><small>Nome e foto</small></button></section> : <EmptyState icon="♙" title="Adicione a primeira pessoa" text="Crie um cartão para organizar o que você deve e suas parcelas." action="Nova pessoa" onAction={onAdd} />}
  </div>;
}

function DebtCard({ debt, month, onToggle, onEdit, onDelete }: { debt: Debt; month: string; onToggle: (number: number) => void; onEdit: () => void; onDelete: () => void }) {
  const paidCount = debt.paidInstallments.length; const portion = debt.totalAmount / debt.installments; const current = monthDiff(debt.startMonth, month) + 1;
  return <article className="debt-card"><div className="debt-summary"><div><span className="overline">DÍVIDA</span><h3>{debt.title}</h3><p>{moneyFormatter.format(debt.totalAmount)} · {debt.installments}× de {moneyFormatter.format(portion)}</p></div><div className="debt-side"><div className="debt-actions"><button onClick={onEdit} aria-label={`Editar dívida ${debt.title}`} title="Editar dívida">✎</button><button className="delete" onClick={onDelete} aria-label={`Excluir dívida ${debt.title}`} title="Excluir dívida">⌫</button></div><div className="debt-balance"><small>Faltam</small><strong>{debt.installments - paidCount} parcelas</strong></div></div></div>
    <div className="debt-progress"><span style={{ width: `${(paidCount / debt.installments) * 100}%` }} /></div><div className="debt-meta"><span>{paidCount} de {debt.installments} pagas</span><span>Vence todo dia {debt.dueDay}</span></div>
    <div className="installment-grid">{Array.from({ length: debt.installments }, (_, index) => index + 1).map(number => { const done = debt.paidInstallments.includes(number); const installmentMonth = shiftMonth(debt.startMonth, number - 1); return <button onClick={() => onToggle(number)} className={`installment ${done ? 'paid' : ''} ${number === current ? 'current' : ''}`} key={number} aria-label={`Parcela ${number}, vencimento ${monthYearLabel(installmentMonth)}, ${done ? 'paga' : 'não paga'}`}><span>{done ? '✓' : number}</span><b>{monthYearLabel(installmentMonth)}</b><small>{done ? 'Paga' : number === current ? 'Atual' : 'Pendente'}</small></button>; })}</div>
  </article>;
}

function BanksView({ banks, selected, month, onSelect, onBack, onAdd, onAddCard, onAddCreditLine, onEditCreditLine, onDeleteCreditLine, onEditCard, onDeleteCard, onInvoice, onEdit, onDelete, setBanks, notify }: { banks: Bank[]; selected: Bank | null; month: string; onSelect: (id: string) => void; onBack: () => void; onAdd: () => void; onAddCard: () => void; onAddCreditLine: () => void; onEditCreditLine: (line: CreditLine) => void; onDeleteCreditLine: (line: CreditLine) => void; onEditCard: (card: Card) => void; onDeleteCard: (card: Card) => void; onInvoice: (card: Card, invoiceMonth?: string) => void; onEdit: (bank: Bank) => void; onDelete: (bank: Bank) => void; setBanks: React.Dispatch<React.SetStateAction<Bank[]>>; notify: (message: string) => void }) {
  function toggleInvoicePaid(bankId: string, card: Card, invoice: Invoice) {
    const markAsPaid = invoice.status !== 'paid';
    setBanks(old => old.map(bank => bank.id === bankId ? { ...bank, cards: bank.cards.map(item => item.id === card.id ? { ...item, invoices: item.invoices.map(saved => saved.id === invoice.id ? { ...saved, status: markAsPaid ? 'paid' : automaticInvoiceStatus(card, invoice.month) } : saved) } : item) } : bank));
    notify(markAsPaid ? 'Fatura marcada como paga.' : 'Pagamento desmarcado; o status voltou a ser automático.');
  }
  function toggleCreditInstallment(bankId: string, line: CreditLine, installment: number) {
    const wasPaid = line.paidInstallments.includes(installment);
    setBanks(old => old.map(bank => bank.id === bankId ? { ...bank, creditLines: bank.creditLines.map(item => item.id === line.id ? { ...item, paidInstallments: wasPaid ? item.paidInstallments.filter(number => number !== installment) : [...item.paidInstallments, installment] } : item) } : bank));
    notify(wasPaid ? 'Parcela da linha de crédito reaberta.' : 'Parcela da linha de crédito marcada como paga.');
  }

  if (selected) return <div className="content detail-page">
    <button className="back-button" onClick={onBack}>← Voltar para bancos</button>
    <section className="detail-hero bank-detail"><Avatar name={selected.name} photo={selected.photo} color={selected.color} large /><div><span className="overline">BANCO</span><h2>{selected.name}</h2><p>{selected.cards.length} {selected.cards.length === 1 ? 'cartão' : 'cartões'} · {selected.creditLines.length} {selected.creditLines.length === 1 ? 'linha de crédito' : 'linhas de crédito'}</p></div><div className="detail-hero-actions"><button className="secondary-button credit-line-button" onClick={onAddCreditLine}>＋ Adicionar linha de crédito</button><button className="primary-button" onClick={onAddCard}>＋ Adicionar cartão</button></div></section>
    <div className="detail-heading"><div><span className="overline">CARTÕES</span><h3>Cartões e faturas</h3></div></div>
    <section className="credit-card-stack">{selected.cards.length ? selected.cards.map(card => {
      const invoice = card.invoices.find(item => item.month === month);
      const currentAutomaticStatus = automaticInvoiceStatus(card, month);
      const currentStatus = invoice ? invoiceStatus(invoice, card) : null;
      const futureInvoices = [...card.invoices].filter(item => item.month > month).sort((a, b) => a.month.localeCompare(b.month));
      return <article className="credit-card-panel" key={card.id}>
        <header className="credit-card-header"><div className="card-brand-icon" style={{ background: selected.color }}>▰</div><div><span className="overline">CARTÃO</span><h3>{card.name}</h3><p>Fecha dia {card.closingDay} · vence dia {card.dueDay}</p></div><div className="credit-card-actions"><button onClick={() => onEditCard(card)} title="Editar cartão" aria-label={`Editar ${card.name}`}>✎</button><button className="delete" onClick={() => onDeleteCard(card)} title="Excluir cartão" aria-label={`Excluir ${card.name}`}>⌫</button><button className="invoice-button" onClick={() => onInvoice(card)}>{invoice ? 'Atualizar fatura' : '＋ Adicionar fatura'}</button></div></header>
        <div className={`card-invoice ${currentStatus ?? 'empty'}`}><div><span className="overline">{monthLabel(month).toUpperCase()}</span><strong>{invoice ? moneyFormatter.format(invoice.value) : 'Sem fatura neste mês'}</strong><small>{invoice ? `Vencimento dia ${card.dueDay}` : 'Cadastre o valor para acompanhar'}</small></div>{invoice && <div className="invoice-controls"><span className={`auto-status ${currentAutomaticStatus}`}>{currentAutomaticStatus === 'open' ? '○ Em aberto' : '● Fechada'} <small>automático</small></span><button className="edit-current-invoice" onClick={() => onInvoice(card, month)}>✎ Editar fatura</button><button className={`payment-toggle ${invoice.status === 'paid' ? 'paid' : ''}`} onClick={() => toggleInvoicePaid(selected.id, card, invoice)}>{invoice.status === 'paid' ? '✓ Paga — desmarcar' : 'Marcar como paga'}</button></div>}</div>
        <section className="future-invoices"><div className="future-invoices-head"><div><span className="overline">PLANEJAMENTO</span><h4>Próximas faturas</h4></div><button onClick={() => onInvoice(card, shiftMonth(month, 1))}>＋ Adicionar mês futuro</button></div>
          {futureInvoices.length ? <div className="future-invoice-list">{futureInvoices.map((item, index) => { const status = invoiceStatus(item, card); return <div className="future-invoice-row" key={item.id}><div className="timeline-marker"><span>{index + 1}</span></div><div className="future-month"><strong>{monthLabel(item.month)}</strong><small>Vence dia {card.dueDay}</small><b className="future-value">{moneyFormatter.format(item.value)}</b></div><span className={`future-status ${status}`}>{status === 'open' ? 'Em aberto' : status === 'closed' ? 'Fechada' : 'Paga'}</span><div className="future-row-actions"><button className="edit-invoice" onClick={() => onInvoice(card, item.month)}>Editar</button><button className={`future-pay ${item.status === 'paid' ? 'paid' : ''}`} onClick={() => toggleInvoicePaid(selected.id, card, item)}>{item.status === 'paid' ? 'Desmarcar paga' : '✓ Marcar paga'}</button></div></div>; })}</div> : <div className="future-empty"><span>↗</span><div><strong>Nenhuma fatura futura</strong><small>Cadastre os próximos meses para visualizar seu planejamento.</small></div></div>}
        </section>
      </article>;
    }) : <EmptyState icon="▰" title="Adicione o primeiro cartão" text="Informe o nome, fechamento e vencimento para lançar as faturas." action="Adicionar cartão" onAction={onAddCard} />}</section>
    <div className="detail-heading credit-line-heading"><div><span className="overline">CRÉDITO PARCELADO</span><h3>Linhas de crédito</h3></div></div>
    <section className="credit-line-stack">{selected.creditLines.length ? selected.creditLines.map(line => <CreditLineCard key={line.id} line={line} month={month} color={selected.color} onEdit={() => onEditCreditLine(line)} onDelete={() => onDeleteCreditLine(line)} onToggle={installment => toggleCreditInstallment(selected.id, line, installment)} />) : <div className="credit-line-empty"><div className="credit-line-icon" style={{ background: selected.color }}>↗</div><div><strong>Nenhuma linha de crédito cadastrada</strong><small>Adicione um produto parcelado com a data completa do primeiro vencimento.</small></div><button className="secondary-button" onClick={onAddCreditLine}>＋ Adicionar linha de crédito</button></div>}</section>
  </div>;

  return <div className="content listing-page"><div className="listing-heading"><div><span className="overline">SUAS CONTAS BANCÁRIAS</span><h2>Seus bancos</h2><p>Cadastre seus bancos e organize cartões e linhas de crédito.</p></div><button className="primary-button" onClick={onAdd}>＋ Novo banco</button></div>
    {banks.length ? <section className="entity-grid bank-grid">{banks.map(bank => { const invoices = bank.cards.map(card => card.invoices.find(item => item.month === month)).filter((item): item is Invoice => Boolean(item)); const creditItems = bank.creditLines.map(line => { const index = monthDiff(line.firstDueDate.slice(0, 7), month); return index >= 0 && index < line.installments ? { value: creditInstallmentValue(line), paid: line.paidInstallments.includes(index + 1) } : null; }).filter((item): item is { value: number; paid: boolean } => Boolean(item)); const total = invoices.reduce((sum, item) => sum + item.value, 0) + creditItems.reduce((sum, item) => sum + item.value, 0); const count = invoices.length + creditItems.length; const paidCount = invoices.filter(item => item.status === 'paid').length + creditItems.filter(item => item.paid).length; return <article className="entity-card bank-card" key={bank.id} role="button" tabIndex={0} onClick={() => onSelect(bank.id)} onKeyDown={event => { if (event.key === 'Enter' && event.target === event.currentTarget) onSelect(bank.id); }}><div className="entity-top"><Avatar name={bank.name} photo={bank.photo} color={bank.color} /><CardActions name={bank.name} onEdit={() => onEdit(bank)} onDelete={() => onDelete(bank)} /></div><h3>{bank.name}</h3><p>{bank.cards.length} {bank.cards.length === 1 ? 'cartão' : 'cartões'} · {bank.creditLines.length} {bank.creditLines.length === 1 ? 'linha de crédito' : 'linhas de crédito'}</p><div className="entity-total"><small>Compromissos de {monthLabel(month).split(' de ')[0]}</small><strong>{count ? moneyFormatter.format(total) : 'Sem valores'}</strong></div><span className={`invoice-pill ${count && paidCount < count ? 'open' : count ? 'paid' : 'empty'}`}>{count ? `${paidCount} de ${count} pagos` : '＋ Adicionar produto'}</span></article>; })}<button className="entity-card new-entity" onClick={onAdd}><span>＋</span><strong>Adicionar banco</strong><small>Nome e foto</small></button></section> : <EmptyState icon="▤" title="Adicione o primeiro banco" text="Cadastre o banco com nome e foto; depois adicione cartões ou linhas de crédito." action="Novo banco" onAction={onAdd} />}
  </div>;
}

function CreditLineCard({ line, month, color, onToggle, onEdit, onDelete }: { line: CreditLine; month: string; color: string; onToggle: (number: number) => void; onEdit: () => void; onDelete: () => void }) {
  const paidCount = line.paidInstallments.length;
  const portion = creditInstallmentValue(line);
  const interest = creditInterestValue(line);
  const current = monthDiff(line.firstDueDate.slice(0, 7), month) + 1;
  return <article className="credit-line-card">
    <div className="credit-line-summary"><div className="credit-line-title"><div className="credit-line-icon" style={{ background: color }}>↗</div><div><span className="overline">LINHA DE CRÉDITO</span><h3>{line.product}</h3><p>Produto: {moneyFormatter.format(line.totalAmount)} · {line.installments}× de {moneyFormatter.format(portion)}</p>{interest > 0 && <span className="credit-interest">Juros estimados: <strong>{moneyFormatter.format(interest)}</strong></span>}</div></div><div className="debt-side"><div className="debt-actions"><button onClick={onEdit} aria-label={`Editar linha de crédito ${line.product}`} title="Editar linha de crédito">✎</button><button className="delete" onClick={onDelete} aria-label={`Excluir linha de crédito ${line.product}`} title="Excluir linha de crédito">⌫</button></div><div className="debt-balance"><small>Faltam</small><strong>{line.installments - paidCount} parcelas</strong></div></div></div>
    <div className="debt-progress"><span style={{ width: `${(paidCount / line.installments) * 100}%` }} /></div><div className="debt-meta"><span>{paidCount} de {line.installments} pagas</span><span>Primeiro vencimento em {fullDateLabel(installmentDueDate(line, 1))}</span></div>
    <div className="credit-installment-grid">{Array.from({ length: line.installments }, (_, index) => index + 1).map(number => { const done = line.paidInstallments.includes(number); const dueDate = installmentDueDate(line, number); return <button onClick={() => onToggle(number)} className={`credit-installment ${done ? 'paid' : ''} ${number === current ? 'current' : ''}`} key={number} aria-label={`Parcela ${number}, vencimento ${fullDateLabel(dueDate)}, ${done ? 'paga' : 'não paga'}`}><span>{number}ª parcela</span><strong>{moneyFormatter.format(portion)}</strong><small>{fullDateLabel(dueDate)}</small><b>{done ? '✓ Paga' : number === current ? 'Atual' : 'Pendente'}</b></button>; })}</div>
  </article>;
}

function EmptyMini() { return <div className="empty-mini"><span>✓</span><p>Nenhum pagamento cadastrado neste mês.</p></div>; }
function EmptyState({ icon, title, text, action, onAction }: { icon: string; title: string; text: string; action: string; onAction: () => void }) { return <section className="empty-state"><div>{icon}</div><h3>{title}</h3><p>{text}</p><button className="primary-button" onClick={onAction}>＋ {action}</button></section>; }

function CardActions({ name, onEdit, onDelete }: { name: string; onEdit: () => void; onDelete: () => void }) {
  return <div className="card-actions" onClick={event => event.stopPropagation()}>
    <button onClick={onEdit} aria-label={`Editar ${name}`} title="Editar">✎</button>
    <button className="delete" onClick={onDelete} aria-label={`Excluir ${name}`} title="Excluir">⌫</button>
    <span className="card-chevron">›</span>
  </div>;
}

function PhotoCropEditor({ source, onApply, onCancel }: { source: string; onApply: (photo: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragStart = useRef<{ x: number; y: number; horizontal: number; vertical: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [horizontal, setHorizontal] = useState(0);
  const [vertical, setVertical] = useState(0);
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);

  function draw() {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const size = canvas.width;
    const baseScale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
    const width = image.naturalWidth * baseScale * zoom;
    const height = image.naturalHeight * baseScale * zoom;
    const x = (size - width) / 2 + ((width - size) / 2) * (horizontal / 100);
    const y = (size - height) / 2 + ((height - size) / 2) * (vertical / 100);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, size, size);
    context.drawImage(image, x, y, width, height);
  }

  useEffect(() => {
    const image = new Image();
    image.onload = () => { imageRef.current = image; setReady(true); };
    image.src = source;
    return () => { imageRef.current = null; };
  }, [source]);
  useEffect(() => { if (ready) draw(); }, [ready, zoom, horizontal, vertical]);

  function applyCrop() {
    const canvas = canvasRef.current;
    if (canvas) onApply(canvas.toDataURL('image/jpeg', .9));
  }

  function dragPhoto(clientX: number, clientY: number) {
    const start = dragStart.current;
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!start || !canvas || !image) return;
    const bounds = canvas.getBoundingClientRect();
    const scale = canvas.width / bounds.width;
    const baseScale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const width = image.naturalWidth * baseScale * zoom;
    const height = image.naturalHeight * baseScale * zoom;
    const xRange = Math.max(1, (width - canvas.width) / 2);
    const yRange = Math.max(1, (height - canvas.height) / 2);
    setHorizontal(Math.max(-100, Math.min(100, start.horizontal + ((clientX - start.x) * scale / xRange) * 100)));
    setVertical(Math.max(-100, Math.min(100, start.vertical + ((clientY - start.y) * scale / yRange) * 100)));
  }

  return <section className="photo-cropper" aria-label="Ajustar enquadramento da foto">
    <div className={`cropper-preview ${dragging ? 'dragging' : ''}`}><canvas ref={canvasRef} width="280" height="280" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = { x: event.clientX, y: event.clientY, horizontal, vertical }; setDragging(true); }} onPointerMove={event => dragPhoto(event.clientX, event.clientY)} onPointerUp={event => { dragPhoto(event.clientX, event.clientY); dragStart.current = null; setDragging(false); }} onPointerCancel={() => { dragStart.current = null; setDragging(false); }} /></div>
    <div className="cropper-copy"><strong>Ajuste o rosto na moldura</strong><small>Arraste a própria foto para posicionar o rosto. Use o zoom para aproximar.</small></div>
    <label className="cropper-zoom"><span>Zoom</span><input type="range" min="1" max="2.6" step="0.05" value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label>
    <div className="cropper-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancelar ajuste</button><button type="button" className="primary-button" onClick={applyCrop} disabled={!ready}>Usar enquadramento</button></div>
  </section>;
}

function PersonForm({ existing, onClose, onSave }: { existing: Person | null; onClose: () => void; onSave: (person: Person) => void }) {
  const [name, setName] = useState(existing?.name ?? ''); const [photo, setPhoto] = useState<string | undefined>(existing?.photo); const [cropSource, setCropSource] = useState<string | null>(null);
  function submit(e: FormEvent) { e.preventDefault(); if (!name.trim()) return; onSave({ id: existing?.id ?? uid('person'), name: name.trim(), photo, color: existing?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)], debts: existing?.debts ?? [] }); }
  function choosePhoto(file?: File) { if (!file) return; if (file.size > 2_000_000) return alert('Escolha uma imagem com até 2 MB.'); const reader = new FileReader(); reader.onload = () => setCropSource(String(reader.result)); reader.readAsDataURL(file); }
  return <Modal title={existing ? 'Editar pessoa' : 'Adicionar pessoa'} subtitle="Altere o nome ou escolha uma nova foto." onClose={onClose}><form onSubmit={submit} className="form-stack">{cropSource ? <PhotoCropEditor source={cropSource} onApply={croppedPhoto => { setPhoto(croppedPhoto); setCropSource(null); }} onCancel={() => setCropSource(null)} /> : <><div className="person-photo-row"><label className="photo-picker"><span className="photo-preview">{photo ? <img src={photo} alt="Prévia" /> : '＋'}</span><strong>{photo ? 'Trocar foto' : 'Escolher foto'}</strong><small>PNG ou JPG · até 2 MB</small><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => choosePhoto(e.target.files?.[0])} /></label>{photo && <button type="button" className="adjust-photo-button" onClick={() => setCropSource(photo)}>⌖ Ajustar rosto</button>}</div><label className="field"><span>Nome da pessoa</span><input autoFocus required value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Maria Oliveira" /></label></>}<div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit">{existing ? 'Salvar alterações' : 'Adicionar pessoa'}</button></div></form></Modal>;
}

function BankForm({ existing, onClose, onSave }: { existing: Bank | null; onClose: () => void; onSave: (bank: Bank) => void }) {
  const [name, setName] = useState(existing?.name ?? ''); const [photo, setPhoto] = useState<string | undefined>(existing?.photo);
  function submit(e: FormEvent) { e.preventDefault(); onSave({ id: existing?.id ?? uid('bank'), name: name.trim(), photo, color: existing?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)], cards: existing?.cards ?? [], creditLines: existing?.creditLines ?? [] }); }
  function choosePhoto(file?: File) { if (!file) return; if (file.size > 2_000_000) return alert('Escolha uma imagem com até 2 MB.'); const reader = new FileReader(); reader.onload = () => setPhoto(String(reader.result)); reader.readAsDataURL(file); }
  return <Modal title={existing ? 'Editar banco' : 'Adicionar banco'} subtitle="Cadastre apenas o banco; os cartões entram na próxima etapa." onClose={onClose}><form onSubmit={submit} className="form-stack"><label className="photo-picker"><span className="photo-preview">{photo ? <img src={photo} alt="Prévia" /> : '＋'}</span><strong>{photo ? 'Trocar foto' : 'Escolher foto'}</strong><small>Logo ou foto · até 2 MB</small><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => choosePhoto(e.target.files?.[0])} /></label><label className="field"><span>Nome do banco</span><input autoFocus required value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Inter" /></label><div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit">{existing ? 'Salvar alterações' : 'Adicionar banco'}</button></div></form></Modal>;
}

function CardForm({ existing, bankName, onClose, onSave }: { existing: Card | null; bankName: string; onClose: () => void; onSave: (card: Card) => void }) {
  const [name, setName] = useState(existing?.name ?? ''); const [closing, setClosing] = useState(String(existing?.closingDay ?? 3)); const [due, setDue] = useState(String(existing?.dueDay ?? 10));
  function submit(e: FormEvent) { e.preventDefault(); onSave({ id: existing?.id ?? uid('card'), name: name.trim(), closingDay: Number(closing), dueDay: Number(due), invoices: existing?.invoices ?? [] }); }
  return <Modal title={existing ? `Editar cartão · ${bankName}` : `Adicionar cartão · ${bankName}`} subtitle="As datas de fechamento e vencimento pertencem a este cartão." onClose={onClose}><form onSubmit={submit} className="form-stack"><label className="field"><span>Nome do cartão</span><input autoFocus required value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Mastercard Gold" /></label><div className="field-row"><label className="field"><span>Dia do fechamento</span><input type="number" min="1" max="31" required value={closing} onChange={e => setClosing(e.target.value)} /></label><label className="field"><span>Dia do vencimento</span><input type="number" min="1" max="31" required value={due} onChange={e => setDue(e.target.value)} /></label></div><div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit">{existing ? 'Salvar alterações' : 'Adicionar cartão'}</button></div></form></Modal>;
}

function DebtForm({ month, personName, existing, onClose, onSave }: { month: string; personName: string; existing: Debt | null; onClose: () => void; onSave: (debt: Debt) => void }) {
  const [title, setTitle] = useState(existing?.title ?? ''); const [amount, setAmount] = useState(existing ? existing.totalAmount.toFixed(2).replace('.', ',') : ''); const [installments, setInstallments] = useState(String(existing?.installments ?? 1)); const [dueDay, setDueDay] = useState(String(existing?.dueDay ?? 10)); const [startMonth, setStartMonth] = useState(existing?.startMonth ?? month);
  function submit(e: FormEvent) { e.preventDefault(); const totalAmount = parseMoney(amount); const installmentCount = Number(installments); if (!totalAmount) return; onSave({ id: existing?.id ?? uid('debt'), title: title.trim(), totalAmount, installments: installmentCount, dueDay: Number(dueDay), startMonth, paidInstallments: (existing?.paidInstallments ?? []).filter(number => number <= installmentCount) }); }
  return <Modal title={existing ? `Editar dívida · ${personName}` : `Nova dívida com ${personName}`} subtitle={existing ? 'Altere os dados sem perder as parcelas já pagas.' : 'Divida o valor e acompanhe cada parcela.'} onClose={onClose}><form onSubmit={submit} className="form-stack"><label className="field"><span>Descrição</span><input autoFocus required value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex.: Celular, empréstimo..." /></label><div className="field-row"><label className="field"><span>Valor total</span><div className="money-input"><b>R$</b><input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" /></div></label><label className="field"><span>Nº de parcelas</span><input type="number" min="1" max="120" required value={installments} onChange={e => setInstallments(e.target.value)} /></label></div><div className="field-row"><label className="field"><span>Primeira parcela</span><input type="month" required value={startMonth} onChange={e => setStartMonth(e.target.value)} /></label><label className="field"><span>Dia de vencimento</span><input type="number" min="1" max="31" required value={dueDay} onChange={e => setDueDay(e.target.value)} /></label></div><div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit">{existing ? 'Salvar alterações' : 'Salvar dívida'}</button></div></form></Modal>;
}

function CreditLineForm({ month, bankName, existing, onClose, onSave }: { month: string; bankName: string; existing: CreditLine | null; onClose: () => void; onSave: (line: CreditLine) => void }) {
  const [product, setProduct] = useState(existing?.product ?? '');
  const [amount, setAmount] = useState(existing ? existing.totalAmount.toFixed(2).replace('.', ',') : '');
  const [installments, setInstallments] = useState(String(existing?.installments ?? 1));
  const [installmentAmount, setInstallmentAmount] = useState(existing ? creditInstallmentValue(existing).toFixed(2).replace('.', ',') : '');
  const [firstDueDate, setFirstDueDate] = useState(existing?.firstDueDate ?? `${month}-10`);
  const totalAmount = parseMoney(amount); const portion = parseMoney(installmentAmount); const installmentCount = Number(installments) || 0; const totalWithInterest = portion * installmentCount; const estimatedInterest = Math.max(0, totalWithInterest - totalAmount);
  function submit(e: FormEvent) { e.preventDefault(); if (!product.trim() || !totalAmount || !portion || !installmentCount || !firstDueDate) return; onSave({ id: existing?.id ?? uid('credit'), product: product.trim(), totalAmount, installmentAmount: portion, installments: installmentCount, firstDueDate, paidInstallments: (existing?.paidInstallments ?? []).filter(number => number <= installmentCount) }); }
  return <Modal title={existing ? `Editar linha de crédito · ${bankName}` : `Adicionar linha de crédito · ${bankName}`} subtitle="Informe o valor do produto e o valor real da parcela; os juros serão calculados automaticamente em reais." onClose={onClose}><form onSubmit={submit} className="form-stack"><label className="field"><span>Produto</span><input autoFocus required value={product} onChange={e => setProduct(e.target.value)} placeholder="Ex.: Empréstimo pessoal, celular..." /></label><div className="field-row"><label className="field"><span>Valor do produto</span><div className="money-input"><b>R$</b><input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" /></div></label><label className="field"><span>Valor de cada parcela</span><div className="money-input"><b>R$</b><input required inputMode="decimal" value={installmentAmount} onChange={e => setInstallmentAmount(e.target.value)} placeholder="0,00" /></div></label></div><div className="field-row"><label className="field"><span>Nº de parcelas</span><input type="number" min="1" max="120" required value={installments} onChange={e => setInstallments(e.target.value)} /></label><label className="field"><span>Data do primeiro vencimento</span><input type="date" required value={firstDueDate} onChange={e => setFirstDueDate(e.target.value)} /></label></div><div className="interest-preview"><div><small>Total das parcelas</small><strong>{moneyFormatter.format(totalWithInterest)}</strong></div><div className={estimatedInterest > 0 ? 'has-interest' : ''}><small>Juros estimados</small><strong>{moneyFormatter.format(estimatedInterest)}</strong></div></div><div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit">{existing ? 'Salvar alterações' : 'Adicionar linha de crédito'}</button></div></form></Modal>;
}

function InvoiceForm({ month, bankName, card, onClose, onSave }: { month: string; bankName: string; card: Card; onClose: () => void; onSave: (invoice: Invoice) => void }) {
  const existing = card.invoices.find(item => item.month === month); const [invoiceMonth, setInvoiceMonth] = useState(month); const [value, setValue] = useState(existing ? String(existing.value).replace('.', ',') : ''); const [paid, setPaid] = useState(existing?.status === 'paid');
  const automaticStatus = automaticInvoiceStatus(card, invoiceMonth);
  function submit(e: FormEvent) { e.preventDefault(); const amount = parseMoney(value); if (!amount) return; const old = card.invoices.find(item => item.month === invoiceMonth); onSave({ id: old?.id ?? uid('invoice'), month: invoiceMonth, value: amount, status: paid ? 'paid' : automaticStatus }); }
  return <Modal title={`${existing ? 'Atualizar' : 'Adicionar'} fatura · ${card.name}`} subtitle={`${bankName} · o estado aberta ou fechada é atualizado pela data do dispositivo.`} onClose={onClose}><form onSubmit={submit} className="form-stack"><div className="field-row"><label className="field"><span>Mês da fatura</span><input type="month" required value={invoiceMonth} onChange={e => { setInvoiceMonth(e.target.value); const found = card.invoices.find(item => item.month === e.target.value); setValue(found ? String(found.value).replace('.', ',') : ''); setPaid(found?.status === 'paid'); }} /></label><label className="field"><span>Valor da fatura</span><div className="money-input"><b>R$</b><input autoFocus required inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} placeholder="0,00" /></div></label></div><div className="automatic-status-box"><div><span className={`auto-status ${automaticStatus}`}>{automaticStatus === 'open' ? '○ Em aberto' : '● Fechada'}</span><small>Definido automaticamente pela data atual e pelo fechamento no dia {card.closingDay}.</small></div><label className={`paid-check ${paid ? 'checked' : ''}`}><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} /><span>{paid ? '✓' : ''}</span><div><strong>Fatura paga</strong><small>Marque somente após realizar o pagamento</small></div></label></div><div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit">Salvar fatura</button></div></form></Modal>;
}
