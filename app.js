/**
 * KahanGaya - Unified Application Logic (Bulletproof Version)
 * This file contains all the core logic to avoid module loading issues on hosts.
 */

// ==========================================
// 1. FINANCIAL BRAIN
// ==========================================
const FinancialBrain = {
    calculateSafeToSpend(state) {
        if (!state) return 0;
        const { balance, commitments, expectedVariableSpend, requiredReserve } = state;
        const knownCommitments = (commitments || []).reduce((sum, c) => sum + (c.amount || 0), 0);
        const safeToSpend = balance - knownCommitments - expectedVariableSpend - requiredReserve;
        return Math.max(0, safeToSpend);
    },

    calculateEmergencyRunway(state) {
        if (!state) return 0;
        const { balance, essentialMonthlyBurn } = state;
        if (!essentialMonthlyBurn || essentialMonthlyBurn <= 0) return Infinity;
        const dailyBurn = essentialMonthlyBurn / 30;
        return Math.floor(balance / dailyBurn);
    },

    rankRecommendations(recommendations, state) {
        if (!recommendations) return [];
        return recommendations.map(rec => {
            const score = (rec.impact * rec.urgency * rec.confidence * rec.relevance * rec.goalAlignment) / rec.effort;
            return { ...rec, priorityScore: score };
        }).sort((a, b) => b.priorityScore - a.priorityScore);
    },

    simulateScenario(currentState, modifications) {
        const modifiedState = JSON.parse(JSON.stringify(currentState));
        Object.assign(modifiedState, modifications);
        const originalSafe = this.calculateSafeToSpend(currentState);
        const newSafe = this.calculateSafeToSpend(modifiedState);
        const originalRunway = this.calculateEmergencyRunway(currentState);
        const newRunway = this.calculateEmergencyRunway(modifiedState);
        return {
            modifiedState,
            diffs: { safeToSpendDelta: newSafe - originalSafe, runwayDelta: newRunway - originalRunway }
        };
    }
};

// ==========================================
// 2. MEMORY STORE
// ==========================================
const MemoryStore = {
    KEYS: { USER_PROFILE: 'kg_user_profile', TRANSACTIONS: 'kg_transactions', GOALS: 'kg_goals' },

    saveProfile(profile) { localStorage.setItem(this.KEYS.USER_PROFILE, JSON.stringify(profile)); },
    getProfile() { 
        const data = localStorage.getItem(this.KEYS.USER_PROFILE);
        return data ? JSON.parse(data) : null;
    },

    saveTransaction(transaction) {
        const txs = this.getTransactions();
        txs.push({ id: Date.now(), date: new Date().toISOString(), ...transaction });
        localStorage.setItem(this.KEYS.TRANSACTIONS, JSON.stringify(txs));
    },
    getTransactions() {
        const data = localStorage.getItem(this.KEYS.TRANSACTIONS);
        return data ? JSON.parse(data) : [];
    },

    saveGoal(goal) {
        const goals = this.getGoals();
        goals.push({ id: Date.now(), createdAt: new Date().toISOString(), ...goal });
        localStorage.setItem(this.KEYS.GOALS, JSON.stringify(goals));
    },
    getGoals() {
        const data = localStorage.getItem(this.KEYS.GOALS);
        return data ? JSON.parse(data) : [];
    },
    deleteGoal(id) {
        const goals = this.getGoals().filter(g => g.id !== id);
        localStorage.setItem(this.KEYS.GOALS, JSON.stringify(goals));
    },

    computeCurrentState() {
        const profile = this.getProfile();
        if (!profile) return null;
        const txs = this.getTransactions();
        let balance = profile.initialBalance || 0;
        txs.forEach(tx => {
            if (tx.type === 'income') balance += tx.amount;
            else balance -= tx.amount;
        });
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const variableSpend = txs
            .filter(tx => new Date(tx.date) > thirtyDaysAgo && tx.type === 'expense' && !tx.isFixed)
            .reduce((sum, tx) => sum + tx.amount, 0);

        return {
            balance: balance,
            commitments: profile.commitments || [],
            expectedVariableSpend: variableSpend,
            requiredReserve: profile.requiredReserve || 0,
            essentialMonthlyBurn: profile.essentialMonthlyBurn || 0
        };
    }
};

// ==========================================
// 3. DISCOVERY ENGINE
// ==========================================
const DiscoveryEngine = {
    discoverInsights() {
        const txs = MemoryStore.getTransactions();
        if (txs.length < 5) return [{ title: 'Need more data', message: 'Add a few more transactions to unlock insights!', severity: 'info' }];
        const insights = [];
        const weekendSpend = txs.filter(tx => {
            const day = new Date(tx.date).getDay();
            return (day === 0 || day === 6) && tx.type === 'expense';
        }).reduce((sum, tx) => sum + tx.amount, 0);
        const weekdaySpend = txs.filter(tx => {
            const day = new Date(tx.date).getDay();
            return (day !== 0 && day !== 6) && tx.type === 'expense';
        }).reduce((sum, tx) => sum + tx.amount, 0);
        const weekdayCount = txs.filter(tx => {
            const day = new Date(tx.date).getDay();
            return (day !== 0 && day !== 6) && tx.type === 'expense';
        }).length;
        if (weekdayCount > 0 && (weekendSpend / 2) > (weekdaySpend / weekdayCount) * 1.5) {
            insights.push({ title: 'Weekend Spike', message: 'Your weekend spending is significantly higher than your daily average.', severity: 'warning' });
        }
        const amountMap = {};
        txs.filter(tx => tx.type === 'expense').forEach(tx => { amountMap[tx.amount] = (amountMap[tx.amount] || 0) + 1; });
        const recurring = Object.entries(amountMap).filter(([amt, count]) => count >= 2);
        if (recurring.length > 0) insights.push({ title: 'Recurring Pattern', message: `Found ${recurring.length} recurring payments. Check for unused subscriptions.`, severity: 'info' });
        const smallTotal = txs.filter(tx => tx.type === 'expense' && tx.amount < 100).reduce((sum, tx) => sum + tx.amount, 0);
        if (smallTotal > 1000) insights.push({ title: 'The Small Leak', message: `Small spends (<₹100) added up to ₹${smallTotal} this month.`, severity: 'warning' });
        return insights.length > 0 ? insights : [{ title: 'Looking Good!', message: 'No unusual leaks detected.', severity: 'healthy' }];
    },
    getRandomSurprise() {
        const insights = this.discoverInsights();
        return insights[Math.floor(Math.random() * insights.length)];
    }
};

// ==========================================
// 4. AI LAYER
// ==========================================
const AILayer = {
    async ask(question) {
        const state = MemoryStore.computeCurrentState();
        if (!state) return "Please set up your profile first!";
        const safe = FinancialBrain.calculateSafeToSpend(state);
        const runway = FinancialBrain.calculateEmergencyRunway(state);
        
        return new Promise((resolve) => {
            setTimeout(() => {
                const q = question.toLowerCase();
                if (q.includes('safe') || q.includes('spend')) resolve(`Based on your data, you have ₹${safe} safe to spend today. I've already subtracted your bills and reserves!`);
                else if (q.includes('runway') || q.includes('survive')) resolve(`Your current emergency runway is ${runway} days. Let's try to increase this to 30+ days for safety.`);
                else if (q.includes('goal')) resolve("Your goals are tracked! I suggest focusing on the one with the nearest deadline first.");
                else resolve("I'm analyzing your numbers. Your trend is stable, but we can optimize your 'Safe-to-Spend' by cutting small leaks!");
            }, 800);
        });
    }
};

// ==========================================
// 5. UI CONTROLLER
// ==========================================
let currentPersonaKey = 'student';
const personaData = {
    student: {
        state: { balance: 5000, commitments: [{amount: 2000}], expectedVariableSpend: 1000, requiredReserve: 500, essentialMonthlyBurn: 3000 },
        recs: [
            { action: "Cut Cab Spend", reason: "High leakage detected in transport", impact: 3, urgency: 3, confidence: 0.7, relevance: 1, goalAlignment: 0.5, effort: 4 },
            { action: "Save ₹500", reason: "Buffer is below target", impact: 2, urgency: 1, confidence: 0.9, relevance: 0.8, goalAlignment: 1, effort: 2 }
        ],
        xray: [
            { cat: "Liquidity", label: "Cash Position", desc: "Low buffer for a student", status: "warning" },
            { cat: "Safety", label: "Emergency Runway", desc: "Below 30-day threshold", status: "danger" },
            { cat: "Behavior", label: "Transport Leak", desc: "Spending on cabs is high", status: "warning" },
            { cat: "Goals", label: "Savings Goal", desc: "On track but slow", status: "healthy" }
        ]
    },
    youngProf: {
        state: { balance: 45000, commitments: [{amount: 15000}], expectedVariableSpend: 8000, requiredReserve: 10000, essentialMonthlyBurn: 20000 },
        recs: [
            { action: "Start SIP", reason: "Excess idle cash detected", impact: 4, urgency: 2, confidence: 0.9, relevance: 1, goalAlignment: 1, effort: 2 },
            { action: "Review Subscriptions", reason: "3 overlapping streaming apps", impact: 2, urgency: 2, confidence: 0.8, relevance: 0.9, goalAlignment: 0.6, effort: 1 }
        ],
        xray: [
            { cat: "Liquidity", label: "Cash Position", desc: "Healthy monthly surplus", status: "healthy" },
            { cat: "Safety", label: "Emergency Runway", desc: "Stable at ~60 days", status: "healthy" },
            { cat: "Behavior", label: "Subscription Leak", desc: "Redundant streaming apps", status: "warning" },
            { cat: "Opportunities", label: "Idle Cash", desc: "Money not working for you", status: "warning" }
        ]
    },
    highEarner: {
        state: { balance: 500000, commitments: [{amount: 40000}], expectedVariableSpend: 20000, requiredReserve: 100000, essentialMonthlyBurn: 60000 },
        recs: [
            { action: "Tax Planning", reason: "Eligible for higher deductions", impact: 5, urgency: 3, confidence: 0.9, relevance: 1, goalAlignment: 1, effort: 3 },
            { action: "Diversify Portfolio", reason: "Over-exposure to equity", impact: 4, urgency: 1, confidence: 0.8, relevance: 1, goalAlignment: 0.9, effort: 2 }
        ],
        xray: [
            { cat: "Liquidity", label: "Cash Position", desc: "Very strong liquidity", status: "healthy" },
            { cat: "Safety", label: "Emergency Runway", desc: "Over 200 days", status: "healthy" },
            { cat: "Risk", label: "Portfolio Concentration", desc: "Too much in one sector", status: "warning" },
            { cat: "Compliance", label: "Tax Optimization", desc: "Potential for 80C gaps", status: "warning" }
        ]
    },
    debtHeavy: {
        state: { balance: 12000, commitments: [{amount: 8000}], expectedVariableSpend: 3000, requiredReserve: 1000, essentialMonthlyBurn: 10000 },
        recs: [
            { action: "Debt Snowball", reason: "Highest interest loan is priority", impact: 5, urgency: 5, confidence: 0.9, relevance: 1, goalAlignment: 1, effort: 4 },
            { action: "Avoid Credit", reason: "Runway is dangerously low", impact: 3, urgency: 5, confidence: 0.9, relevance: 1, goalAlignment: 1, effort: 1 }
        ],
        xray: [
            { cat: "Liquidity", label: "Cash Position", desc: "Dangerously tight", status: "danger" },
            { cat: "Safety", label: "Emergency Runway", desc: "Critical: < 30 days", status: "danger" },
            { cat: "Obligations", label: "Debt Load", desc: "High DTI ratio", status: "danger" },
            { cat: "Risk", label: "Credit Dependency", desc: "High risk of new debt", status: "danger" }
        ]
    },
    aggressiveSaver: {
        state: { balance: 120000, commitments: [{amount: 10000}], expectedVariableSpend: 5000, requiredReserve: 50000, essentialMonthlyBurn: 15000 },
        recs: [
            { action: "Increase Goal Contribution", reason: "On track to hit goal early", impact: 3, urgency: 1, confidence: 0.9, relevance: 1, goalAlignment: 1, effort: 1 },
            { action: "Treat Yourself", reason: "Saving rate is > 70%, consider burnout", impact: 1, urgency: 1, confidence: 0.6, relevance: 0.7, goalAlignment: 0.3, effort: 1 }
        ],
        xray: [
            { cat: "Liquidity", label: "Cash Position", desc: "Extremely strong", status: "healthy" },
            { cat: "Safety", label: "Emergency Runway", desc: "Very secure", status: "healthy" },
            { cat: "Psychology", label: "Saving Rate", desc: "Aggressive (might be too high)", status: "warning" },
            { cat: "Goals", label: "Progress", desc: "Accelerating ahead of schedule", status: "healthy" }
        ]
    }
};

window.showPage = (pageId) => {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    const page = document.getElementById(pageId);
    if (page) page.classList.add('active');
    const tab = document.querySelector(`[onclick="showPage('${pageId}')"]`);
    if (tab) tab.classList.add('active');
};

window.loadPersona = (key) => {
    currentPersonaKey = key;
    const p = personaData[key];
    if (!p) return;
    const state = p.state;
    const safe = FinancialBrain.calculateSafeToPSpend ? FinancialBrain.calculateSafeToPSpend(state) : FinancialBrain.calculateSafeToSpend(state);
    const runway = FinancialBrain.calculateEmergencyRunway(state);
    const ranked = FinancialBrain.rankRecommendations(p.recs, state);
    document.getElementById('safe-to-spend').innerHTML = `₹${safe}<span class="unit"></span>`;
    document.getElementById('runway').innerHTML = `${runway}<span class="unit">days</span>`;
    const health = runway > 90 ? 'Excellent' : runway > 30 ? 'Stable' : 'At Risk';
    document.getElementById('health-score').innerText = health;
    document.getElementById('health-score').style.color =
        health === 'Excellent' ? 'var(--accent-success)' :
        health === 'Stable' ? 'var(--accent-warning)' : 'var(--accent-danger)';
    const recContainer = document.getElementById('rec-list');
    recContainer.innerHTML = '';
    ranked.forEach((rec, index) => {
        const div = document.createElement('div');
        div.className = 'rec-card';
        div.innerHTML = `
            <div class="rec-icon">${index + 1}</div>
            <div class="rec-content">
                <div class="rec-action">${rec.action}</div>
                <div class="rec-reason">${rec.reason}</div>
            </div>
        `;
        recContainer.appendChild(div);
    });
    const xrayContainer = document.getElementById('xray-grid');
    xrayContainer.innerHTML = '';
    if (p.xray) {
        p.xray.forEach(item => {
            const div = document.createElement('div');
            div.className = 'xray-category';
            div.innerHTML = `
                <div class="xray-info">
                    <h4>${item.label} <span style="color: var(--text-muted); font-weight: normal; font-size: 0.7rem;">(${item.cat})</span></h4>
                    <p>${item.desc}</p>
                </div>
                <div class="status-pill pill-${item.status}">${item.status}</div>
            `;
            xrayContainer.appendChild(div);
        });
    }
    document.querySelectorAll('.persona-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.toLowerCase().includes(key.toLowerCase().replace('youngprof', 'young prof').replace('debtheavy', 'debt heavy').replace('aggregivesaver', 'saver')));
    });
};

window.runSimulation = () => {
    const value = parseFloat(document.getElementById('sim-value').value);
    const type = document.getElementById('sim-type').value;
    if (isNaN(value)) {
        document.getElementById('sim-result').innerText = "Please enter a valid number.";
        return;
    }
    const currentState = currentPersonaKey ? personaData[currentPersonaKey].state : MemoryStore.computeCurrentState();
    if (!currentState) {
        document.getElementById('sim-result').innerText = "Please set up your profile first!";
        return;
    }
    let modifications = {};
    if (type === 'balance') modifications.balance = currentState.balance + value;
    if (type === 'expense') modifications.balance = currentState.balance - value;
    if (type === 'burn') modifications.essentialMonthlyBurn = Math.max(0, currentState.essentialMonthlyBurn - value);
    const result = FinancialBrain.simulateScenario(currentState, modifications);
    const { safeToSpendDelta, runwayDelta } = result.diffs;
    const safeText = safeToSpendDelta >= 0 ? `+₹${safeToSpendDelta}` : `-₹${Math.abs(safeToSpendDelta)}`;
    const runwayText = runwayDelta >= 0 ? `+${runwayDelta} days` : `${runwayDelta} days`;
    document.getElementById('sim-result').innerHTML = `Ripple Effect: <span style="color: var(--accent-primary)">${safeText}</span> Safe-to-Spend, <span style="color: var(--accent-primary)">${runwayText}</span> Runway.`;
};

window.saveProfile = () => {
    const profile = {
        initialBalance: parseFloat(document.getElementById('prof-balance').value) || 0,
        essentialMonthlyBurn: parseFloat(document.getElementById('prof-burn').value) || 0,
        requiredReserve: parseFloat(document.getElementById('prof-reserve').value) || 0,
        commitments: []
    };
    MemoryStore.saveProfile(profile);
    alert("Profile Saved!");
    updateDashboardFromStore();
};

window.addTransaction = () => {
    const amount = parseFloat(document.getElementById('tx-amount').value);
    const type = document.getElementById('tx-type').value;
    if (isNaN(amount)) return;
    MemoryStore.saveTransaction({ amount, type, isFixed: false });
    document.getElementById('tx-amount').value = '';
    updateTxList();
    updateDashboardFromStore();
};

window.updateTxList = () => {
    const txs = MemoryStore.getTransactions();
    const list = document.getElementById('tx-list');
    list.innerHTML = txs.slice().reverse().map(tx => `
        <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #0f172a; border-radius: 0.4rem; font-size: 0.8rem;">
            <span>${tx.type === 'income' ? '🟢' : '🔴'} ${tx.type}</span>
            <span style="font-weight: bold;">₹${tx.amount}</span>
        </div>
    `).join('');
};

window.saveGoal = () => {
    const name = document.getElementById('goal-name').value;
    const target = parseFloat(document.getElementById('goal-target').value);
    const monthly = parseFloat(document.getElementById('goal-monthly').value);
    const deadline = document.getElementById('goal-deadline').value;
    if (!name || isNaN(target)) return alert("Please enter goal name and target.");
    MemoryStore.saveGoal({ name, target, monthly: monthly || 0, deadline, saved: 0 });
    document.getElementById('goal-name').value = '';
    document.getElementById('goal-target').value = '';
    document.getElementById('goal-monthly').value = '';
    document.getElementById('goal-deadline').value = '';
    updateGoalsList();
};

window.updateGoalsList = () => {
    const goals = MemoryStore.getGoals();
    const list = document.getElementById('goals-list');
    list.innerHTML = goals.map(g => {
        const progress = (g.saved / g.target) * 100;
        return `
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <span style="font-weight: bold;">${g.name}</span>
                    <span style="font-size: 0.8rem; color: var(--text-muted);">₹${g.saved} / ₹${g.target}</span>
                </div>
                <div style="width: 100%; background: #0f172a; height: 10px; border-radius: 5px; overflow: hidden; margin-bottom: 1rem;">
                    <div style="width: ${Math.min(100, progress)}%; background: var(--accent-primary); height: 100%;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.75rem; color: var(--text-muted);">Monthly: ₹${g.monthly}</span>
                    <button onclick="deleteGoal(${g.id})" style="background: none; border: none; color: var(--accent-danger); cursor: pointer; font-size: 0.75rem;">Delete</button>
                </div>
            </div>
        `;
    }).join('');
};

window.deleteGoal = (id) => {
    MemoryStore.deleteGoal(id);
    updateGoalsList();
};

window.updateDashboardFromStore = () => {
    const state = MemoryStore.computeCurrentState();
    if (!state) return;
    const safe = FinancialBrain.calculateSafeToSpend(state);
    const runway = FinancialBrain.calculateEmergencyRunway(state);
    document.getElementById('safe-to-spend').innerHTML = `₹${safe}<span class="unit"></span>`;
    document.getElementById('runway').innerHTML = `${runway}<span class="unit">days</span>`;
    const health = runway > 90 ? 'Excellent' : runway > 30 ? 'Stable' : 'At Risk';
    document.getElementById('health-score').innerText = health;
    document.getElementById('health-score').style.color = 
        health === 'Excellent' ? 'var(--accent-success)' : 
        health === 'Stable' ? 'var(--accent-warning)' : 'var(--accent-danger)';
    document.getElementById('rec-list').innerHTML = '<div style="color: var(--text-muted); text-align: center; font-size: 0.8rem;">Personalized recommendations coming soon...</div>';
    document.querySelectorAll('.persona-btn').forEach(btn => btn.classList.remove('active'));
    currentPersonaKey = null;
};

window.toggleChat = () => {
    const win = document.getElementById('chat-window');
    win.style.display = win.style.display === 'flex' ? 'none' : 'flex';
};

window.sendChatMessage = async () => {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    const container = document.getElementById('chat-messages');
    container.innerHTML += `<div class="msg msg-user">${msg}</div>`;
    input.value = '';
    container.scrollTop = container.scrollHeight;
    const aiMsgDiv = document.createElement('div');
    aiMsgDiv.className = 'msg msg-ai';
    aiMsgDiv.innerText = '...';
    container.appendChild(aiMsgDiv);
    try {
        const response = await AILayer.ask(msg);
        aiMsgDiv.innerText = response;
    } catch (e) {
        aiMsgDiv.innerText = "Sorry, I'm having trouble connecting to my brain.";
    }
    container.scrollTop = container.scrollHeight;
};

window.triggerSurprise = () => {
    const surprise = DiscoveryEngine.getRandomSurprise();
    const textElement = document.getElementById('surprise-text');
    textElement.style.color = 'var(--text-main)';
    textElement.innerHTML = `<strong>${surprise.title}:</strong> ${surprise.message}`;
    const card = textElement.parentElement;
    card.style.transform = 'scale(1.02)';
    setTimeout(() => card.style.transform = 'scale(1)', 100);
};

window.onload = () => {
    loadPersona('student');
    updateTxList();
    updateGoalsList();
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW Registered!'))
            .catch(err => console.log('SW Registration failed:', err));
    }
};
