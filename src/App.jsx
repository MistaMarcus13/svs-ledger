import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Copy, 
  TrendingUp, 
  ShieldCheck, 
  Package, 
  Search,
  Users,
  FileText,
  Download,
  CheckCircle2,
  X,
  ShoppingCart,
  ChevronRight,
  Eye,
  AlertCircle,
  Save,
  PlusSquare,
  History,
  Eraser,
  Globe,
  StickyNote,
  ClipboardList
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, query, deleteDoc } from 'firebase/firestore';

/**
 * SVS TACTICAL LEDGER
 * INSTRUCTIONS FOR HOSTING:
 * 1. Fill in your Firebase Config object below from your Firebase Console.
 * 2. Set Firestore rules to allow read/write for 'artifacts/svs-tactical-ledger/...'
 * 3. Enable Anonymous Auth in Firebase.
 */

const firebaseConfig = {
  apiKey: "AIzaSyDhVSmL22NfKibfrDCQDF2LPvnotOxaxzY",
  authDomain: "svs-ledger.firebaseapp.com",
  projectId: "svs-ledger",
  storageBucket: "svs-ledger.appspot.com",
  messagingSenderId: "1054484567890",
  appId: "1:1054484567890:web:1a2b3c4d5e6f7g8h9i0jkl"
};

// Handle environments where config might be passed differently
const finalConfig = (typeof __firebase_config !== 'undefined') 
  ? JSON.parse(__firebase_config) 
  : firebaseConfig;

const app = initializeApp(finalConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'svs-tactical-ledger';

const DEFAULT_PRESETS = [
  "Pistol", "Combat Pistol", "AP Pistol", "Heavy Pistol", "SP45",
  "Micro SMG", "SMG", "Combat PDW", "Gusenberg", "Tactical SMG",
  "Assault Rifle", "Carbine Rifle", "Special Carbine", "Tactical Rifle",
  "Combat MG", "Pump Shotgun",
  "9mm Ammo", "5.56 Ammo", "7.62 Ammo", "Shotgun Shells",
  "Armor Plate"
];

const App = () => {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [customPresets, setCustomPresets] = useState([]);
  const [buyerName, setBuyerName] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [pendingItems, setPendingItems] = useState([]);
  const [currentItem, setCurrentItem] = useState({
    itemName: '',
    amount: '',
    serialNumbersRaw: '',
    costPer: ''
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [statusMsg, setStatusMsg] = useState({ text: '', type: 'success' });
  const [previewModal, setPreviewModal] = useState({ isOpen: false, dataUrl: '', transactionId: '', transactionData: null });
  const canvasRef = useRef(null);

  const allPresets = useMemo(() => {
    return [...new Set([...DEFAULT_PRESETS, ...customPresets])].sort();
  }, [customPresets]);

  // Auth Logic
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Sync Data
  useEffect(() => {
    if (!user) return;
    
    const transCol = collection(db, 'artifacts', appId, 'public', 'data', 'transactions');
    const unsubTrans = onSnapshot(transCol, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const sorted = docs.sort((a, b) => Number(b.id) - Number(a.id));
      setTransactions(sorted);
    });

    const presetsCol = collection(db, 'artifacts', appId, 'public', 'data', 'presets');
    const unsubPresets = onSnapshot(presetsCol, (snapshot) => {
      const items = snapshot.docs.map(doc => doc.data().name);
      setCustomPresets(items);
    });

    return () => {
      unsubTrans();
      unsubPresets();
    };
  }, [user]);

  // Auto-Quantity based on SN count
  useEffect(() => {
    if (currentItem.serialNumbersRaw.trim()) {
      const count = currentItem.serialNumbersRaw
        .split(/[\n,]+/)
        .map(s => s.trim())
        .filter(s => s !== "").length;
      if (count > 0 && (!currentItem.amount || currentItem.amount === "0")) {
        setCurrentItem(prev => ({ ...prev, amount: count.toString() }));
      }
    }
  }, [currentItem.serialNumbersRaw]);

  const showStatus = (text, type = 'success') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg({ text: '', type: 'success' }), 4000);
  };

  const handleItemChange = (e) => {
    const { name, value } = e.target;
    setCurrentItem(prev => ({ ...prev, [name]: value }));
  };

  const saveToPresets = async () => {
    if (!currentItem.itemName.trim() || !user) return;
    if (allPresets.includes(currentItem.itemName)) return;
    try {
      const presetId = currentItem.itemName.toLowerCase().replace(/\s+/g, '-');
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'presets', presetId), {
        name: currentItem.itemName,
        addedBy: user.uid,
        timestamp: Date.now()
      });
      showStatus(`"${currentItem.itemName}" cataloged`);
    } catch (err) {
      showStatus("Database error", "error");
    }
  };

  const addPendingItem = (e) => {
    e.preventDefault();
    if (!currentItem.itemName || !currentItem.amount || !currentItem.costPer) return;
    const snArray = currentItem.serialNumbersRaw.split(/[\n,]+/).map(s => s.trim()).filter(s => s !== "");
    const newItem = {
      ...currentItem,
      id: Date.now(),
      serialNumbers: snArray,
      total: Number(currentItem.amount) * Number(currentItem.costPer)
    };
    setPendingItems([...pendingItems, newItem]);
    setCurrentItem({ itemName: '', amount: '', serialNumbersRaw: '', costPer: '' });
  };

  const finalizeTransaction = async () => {
    if (pendingItems.length === 0 || !user) return;
    const grandTotal = pendingItems.reduce((acc, item) => acc + item.total, 0);
    const transId = Date.now().toString();
    const newTransaction = {
      timestamp: new Date().toLocaleString(),
      buyerName: buyerName || 'SVS',
      notes: orderNotes,
      items: pendingItems,
      grandTotal
    };
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'transactions', transId), newTransaction);
      setPendingItems([]);
      setBuyerName('');
      setOrderNotes('');
      showStatus("Manifest Logged");
    } catch (err) {
      showStatus("Secure write failed", "error");
    }
  };

  const removeTransaction = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'transactions', id.toString()));
      showStatus("Record Purged");
    } catch (err) {
      showStatus("Permission denied", "error");
    }
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => 
      t.buyerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.items?.some(i => i.itemName?.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [transactions, searchTerm]);

  // Export Formatting (Requested Style)
  const formatAsMarkdown = (t) => {
    const itemsText = t.items.map(i => 
      ` - **${i.itemName}** *(x${i.amount})* | SNs: ${i.serialNumbers?.join(', ') || 'N/A'} | *$${Number(i.total).toLocaleString()}*`
    ).join('\n');
    let res = `**BUYER:** *${t.buyerName}*\n${itemsText}\n**GRAND TOTAL:** *$${Number(t.grandTotal).toLocaleString()}*`;
    if (t.notes) res += `\n**NOTES:** ${t.notes}`;
    return res;
  };

  const copyToClipboard = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    showStatus("Export Copied");
  };

  const generateManifestVisual = (t) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const itemsCount = t.items.length;
    canvas.width = 800;
    canvas.height = 500 + (itemsCount * 90) + (t.notes ? 80 : 0);

    // Deep Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // SVS Header
    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(0, 0, canvas.width, 140);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('SVS', 50, 85);
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('TACTICAL LOGISTICS MANIFEST', 50, 115);

    // Meta
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('TIMESTAMP', 50, 185);
    ctx.fillText('RECIPIENT', 450, 185);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '16px monospace';
    ctx.fillText(t.timestamp.toUpperCase(), 50, 210);
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(t.buyerName.toUpperCase(), 450, 210);

    // Table
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(50, 250, 700, 45);
    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('ASSET', 70, 278);
    ctx.fillText('QTY', 350, 278);
    ctx.fillText('PRICE EA', 480, 278);
    ctx.fillText('TOTAL', 660, 278);

    let y = 330;
    t.items.forEach(item => {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(item.itemName.toUpperCase(), 70, y);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '16px sans-serif';
      ctx.fillText(item.amount, 350, y);
      ctx.fillText(`$${Number(item.costPer).toLocaleString()}`, 480, y);
      ctx.fillStyle = '#60a5fa';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(`$${Number(item.total).toLocaleString()}`, 660, y);
      
      if (item.serialNumbers?.length > 0) {
        y += 22;
        ctx.fillStyle = '#475569';
        ctx.font = '11px monospace';
        const sns = item.serialNumbers.join(', ');
        ctx.fillText(`SN: ${sns.length > 80 ? sns.substring(0, 77) + '...' : sns}`, 70, y);
      }
      y += 55;
      ctx.strokeStyle = '#334155';
      ctx.strokeRect(50, y - 25, 700, 1);
    });

    if (t.notes) {
      y += 20;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(50, y - 20, 700, 50);
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('LOGISTICS NOTES', 65, y - 5);
      ctx.fillStyle = '#f1f5f9';
      ctx.font = 'italic 14px sans-serif';
      ctx.fillText(t.notes.substring(0, 90), 65, y + 15);
      y += 60;
    }

    // Total
    const fY = canvas.height - 120;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, fY, canvas.width, 120);
    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('TOTAL SETTLEMENT', 50, fY + 45);
    ctx.font = 'bold 52px monospace';
    ctx.fillText(`$${Number(t.grandTotal).toLocaleString()}`, 50, fY + 100);

    setPreviewModal({
      isOpen: true,
      dataUrl: canvas.toDataURL(),
      transactionId: t.id,
      transactionData: t
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-4 md:p-8 selection:bg-blue-500/30">
      <canvas ref={canvasRef} className="hidden" />

      {/* Manifest Viewer Modal */}
      {previewModal.isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] w-full max-w-3xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <span className="text-blue-400 font-black uppercase tracking-widest text-xs flex items-center gap-2">
                <Globe size={18} /> SVS Secured Manifest
              </span>
              <button onClick={() => setPreviewModal({ ...previewModal, isOpen: false })} className="text-slate-500 hover:text-white"><X size={24}/></button>
            </div>
            <div className="p-8 flex flex-col items-center">
              <img src={previewModal.dataUrl} className="rounded-lg shadow-2xl border border-slate-700 max-h-[60vh] object-contain" />
              <div className="mt-8 flex gap-4">
                <button onClick={() => {
                   const canvas = canvasRef.current;
                   canvas.toBlob(blob => {
                     const item = new ClipboardItem({"image/png": blob});
                     navigator.clipboard.write([item]);
                     showStatus("Image Copied");
                   });
                }} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-black uppercase flex items-center gap-2 active:scale-95 transition-all">
                  <Copy size={20}/> Copy Image
                </button>
                <button onClick={() => {
                  const a = document.createElement('a');
                  a.href = previewModal.dataUrl;
                  a.download = `SVS-${previewModal.transactionId}.png`;
                  a.click();
                }} className="bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white px-8 py-4 rounded-xl font-bold flex items-center gap-2">
                  <Download size={20}/> Download PNG
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notifications */}
      {statusMsg.text && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[110] px-8 py-4 rounded-2xl font-black shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4 ${statusMsg.type === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
          {statusMsg.type === 'error' ? <AlertCircle size={20}/> : <CheckCircle2 size={20}/>}
          {statusMsg.text}
        </div>
      )}

      <div className="max-w-7xl mx-auto mb-12 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-blue-400 uppercase flex items-center gap-5">
            <ShieldCheck size={56} className="text-blue-500" /> SVS Ledger
          </h1>
          <div className="flex items-center gap-3 mt-3">
            <div className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
              <span className="text-[10px] text-blue-400 font-black uppercase tracking-[0.2em]">Secure Node 04 Active</span>
            </div>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2rem] flex items-center gap-6 shadow-xl">
          <TrendingUp size={36} className="text-blue-400" />
          <div>
            <p className="text-[10px] uppercase text-slate-500 font-black tracking-widest mb-1">Total Assets Circulated</p>
            <p className="text-4xl font-mono text-blue-300 font-bold tracking-tighter">${transactions.reduce((acc, t) => acc + (t.grandTotal || 0), 0).toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Creation Panel */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl sticky top-8">
            <div className="p-8 border-b border-slate-800 bg-blue-500/5 flex items-center gap-3 text-blue-400">
              <ShoppingCart size={24} /> <h2 className="text-xl font-black uppercase tracking-tight">New Shipment</h2>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Recipient</label>
                  <input value={buyerName} onChange={e => setBuyerName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl py-4 px-6 focus:border-blue-500 outline-none transition-all text-slate-100 font-bold placeholder:text-slate-800" placeholder="Organization / Member ID" />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Logistics Notes</label>
                  <textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)} rows="2" className="w-full bg-slate-950 border border-slate-800 rounded-xl py-4 px-6 focus:border-blue-500 outline-none text-sm font-bold text-slate-300 resize-none" placeholder="Add delivery instructions..." />
                </div>
              </div>

              <form onSubmit={addPendingItem} className="bg-slate-800/20 p-6 rounded-2xl border border-slate-800 space-y-5">
                <div className="flex items-center gap-2 text-[11px] font-black text-blue-400 uppercase tracking-widest border-b border-slate-800/50 pb-4 mb-2">
                  <Package size={14} /> Item Selection
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] font-black text-slate-500 uppercase">Asset Name</label>
                      {currentItem.itemName && !allPresets.includes(currentItem.itemName) && (
                        <button type="button" onClick={saveToPresets} className="text-[10px] text-blue-400 font-bold uppercase bg-blue-400/5 px-2 py-1 rounded">Catalog Item</button>
                      )}
                    </div>
                    <input list="svs-presets" name="itemName" value={currentItem.itemName} onChange={handleItemChange} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-md focus:border-blue-500 outline-none font-bold" placeholder="Select..." required />
                    <datalist id="svs-presets">{allPresets.map(p => <option key={p} value={p} />)}</datalist>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <input type="number" name="amount" value={currentItem.amount} onChange={handleItemChange} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono font-bold" placeholder="QTY" required />
                    <input type="number" name="costPer" value={currentItem.costPer} onChange={handleItemChange} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono font-bold" placeholder="$ PRICE" required />
                  </div>
                  <textarea name="serialNumbersRaw" value={currentItem.serialNumbersRaw} onChange={handleItemChange} rows="2" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-500 resize-none" placeholder="Paste Serial List..." />
                </div>
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 uppercase transition-all active:scale-95 shadow-lg shadow-blue-600/10">
                  <Plus size={20} /> Attach To Manifest
                </button>
              </form>

              {pendingItems.length > 0 ? (
                <div className="space-y-4 pt-4">
                  <div className="flex justify-between items-center px-1">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Draft</h3>
                    <button onClick={() => setPendingItems([])} className="text-[10px] text-red-400 font-black uppercase">Wipe</button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {pendingItems.map(i => (
                      <div key={i.id} className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                        <div>
                          <p className="font-black text-slate-100">{i.itemName}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">x{i.amount} @ ${Number(i.costPer).toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-blue-400 font-black">${i.total.toLocaleString()}</span>
                          <button onClick={() => removePendingItem(i.id)} className="text-slate-800 hover:text-red-400"><X size={18}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="pt-6 border-t border-slate-800 space-y-4">
                    <div className="text-4xl font-mono text-blue-400 font-black tracking-tighter">${pendingItems.reduce((acc, i) => acc + i.total, 0).toLocaleString()}</div>
                    <button onClick={finalizeTransaction} className="w-full bg-slate-100 hover:bg-white text-slate-950 font-black py-5 rounded-2xl uppercase transition-all shadow-xl flex items-center justify-center gap-3">
                      <Save size={24} /> Secure Record
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-[2rem] opacity-30 flex flex-col items-center gap-3">
                  <ShoppingCart size={32} />
                  <p className="text-[10px] font-black uppercase tracking-widest">Awaiting Manifest Assets</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Records Panel */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-blue-500 transition-colors" size={20} />
              <input type="text" placeholder="Search Secure Logs..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-4.5 pl-14 pr-4 outline-none focus:border-blue-500 shadow-xl font-bold" />
            </div>
            <button onClick={() => copyToClipboard(transactions.map(formatAsMarkdown).join('\n\n---\n\n'))} className="w-full md:w-auto bg-slate-800 hover:bg-slate-700 text-slate-200 px-8 py-4.5 rounded-2xl border border-slate-700 font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2">
              <Copy size={18} /> Export Data
            </button>
          </div>

          <div className="space-y-6 pb-20">
            {filteredTransactions.map(t => (
              <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl transition-all hover:border-blue-500/20 group">
                <div className="p-6 md:p-8 bg-slate-800/20 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                  <div className="flex items-center gap-5">
                    <div className="bg-blue-600 p-4 rounded-2xl text-white shadow-lg"><FileText size={24}/></div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-100 tracking-tight uppercase">{t.buyerName}</h3>
                      <p className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-widest mt-1">{t.timestamp}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <button onClick={() => generateManifestVisual(t)} className="flex-1 sm:flex-none p-3.5 bg-blue-500/10 hover:bg-blue-500 hover:text-white text-blue-400 rounded-xl transition-all flex items-center justify-center gap-2 px-6 font-black uppercase text-[10px] tracking-widest border border-blue-500/10">
                      <Eye size={16}/> Visual
                    </button>
                    <button onClick={() => copyToClipboard(formatAsMarkdown(t))} className="flex-1 sm:flex-none p-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all flex items-center justify-center gap-2 px-6 font-black uppercase text-[10px] tracking-widest border border-slate-700">
                      <ClipboardList size={16}/> Copy Text
                    </button>
                    <button onClick={() => removeTransaction(t.id)} className="p-3.5 text-slate-700 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"><Trash2 size={20}/></button>
                  </div>
                </div>

                {t.notes && (
                  <div className="px-8 pt-6">
                    <div className="bg-slate-800/20 border border-slate-800/50 p-4 rounded-xl flex items-start gap-3">
                      <StickyNote size={14} className="text-blue-500 mt-0.5" />
                      <p className="text-xs text-slate-400 italic leading-relaxed">"{t.notes}"</p>
                    </div>
                  </div>
                )}

                <div className="p-6 md:p-8 space-y-6">
                  {t.items?.map((item, idx) => (
                    <div key={idx} className="flex flex-col border-b border-slate-800/30 pb-6 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-blue-500"><ChevronRight size={18}/></span>
                          <span className="font-black text-xl text-slate-100">{item.itemName}</span>
                          <span className="text-[10px] bg-slate-800 text-slate-500 px-3 py-1 rounded-full font-black uppercase tracking-widest">x {item.amount}</span>
                        </div>
                        <span className="font-mono text-2xl font-black text-slate-100">${Number(item.total).toLocaleString()}</span>
                      </div>
                      {item.serialNumbers?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2 pl-7">
                          {item.serialNumbers.map((sn, snIdx) => (
                            <span key={snIdx} className="text-[9px] font-mono bg-slate-950 border border-slate-800 text-slate-600 px-2.5 py-1 rounded-md">{sn}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="px-8 py-6 bg-slate-900/50 flex flex-col sm:flex-row justify-between items-center border-t border-slate-800 gap-4">
                  <span className="text-[10px] uppercase font-black text-slate-700 tracking-[0.4em]">SVS Secure Ledger Node</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-slate-500 text-[10px] font-black uppercase">Grand Total:</span>
                    <span className="text-4xl font-mono font-black text-blue-400 tracking-tighter">${Number(t.grandTotal).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;