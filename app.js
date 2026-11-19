import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { curriculum, questions } from "./question-bank.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAX60BFhb-yz50dRi0WlVsMznEmRmDDo2U",
  authDomain: "humss-review-hub.firebaseapp.com",
  projectId: "humss-review-hub",
  storageBucket: "humss-review-hub.firebasestorage.app",
  messagingSenderId: "586899826711",
  appId: "1:586899826711:web:0e65df4b2ac89734dc1452"
};

const configured = firebaseConfig.apiKey !== "PASTE_API_KEY";
let auth, db;

if (configured) {
  const fb = initializeApp(firebaseConfig);
  auth = getAuth(fb);
  db = getFirestore(fb);
}

const $ = id => document.getElementById(id);
const views = ["authView","dashboardView","setupView","reviewView","resultsView","adminView"];

function showView(id) {
  views.forEach(v => $(v).classList.toggle("hidden", v !== id));
  window.scrollTo({top:0,behavior:"smooth"});
}

function toast(msg) {
  $("toast").textContent = msg;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2600);
}

function escapeHTML(s = "") {
  return String(s).replace(/[&<>"']/g,c=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[c]));
}

let user = null,
    authMode = "login",
    selectedSubject = null,
    session = [],
    index = 0,
    answers = [],
    locked = false,
    itemInterval = null,
    sessionInterval = null,
    itemRemaining = 0,
    sessionRemaining = 0,
    settings = {};

if (!configured) {
  $("authMessage").textContent = "Setup required: add your Firebase configuration in app.js and publish the Firestore rules. See README.md.";
  $("authSubmit").disabled = true;
}

document.querySelectorAll("[data-auth]").forEach(b => b.addEventListener("click", () => {
  authMode = b.dataset.auth;
  document.querySelectorAll("[data-auth]").forEach(x => x.classList.toggle("active", x === b));
  $("nameField").classList.toggle("hidden", authMode !== "signup");
  $("authSubmit").textContent = authMode === "signup" ? "Create account" : "Log in";
  $("authMessage").textContent = "";
}));

$("authForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!configured) return;

  const email = $("email").value.trim();
  const pass = $("password").value;

  try {
    if (authMode === "signup") {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      const name = $("fullName").value.trim() || "Student";

      await updateProfile(cred.user, {displayName:name});

      await setDoc(doc(db, "users", cred.user.uid), {
        displayName:name,
        email,
        createdAt:serverTimestamp(),
        role:"student"
      });

      toast("Account created.");
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
    }
  } catch (err) {
    $("authMessage").textContent = err.message;
  }
});

// AUTOMATIC LOGIN AND ADMIN DETECTION
if (configured) {
  onAuthStateChanged(auth, async u => {
    user = u;

    if (!u) {
      $("logoutBtn").classList.add("hidden");
      $("userLabel").textContent = "";
      showView("authView");
      return;
    }

    $("logoutBtn").classList.remove("hidden");
    $("userLabel").textContent = u.displayName || u.email;

    try {
      const admin = await isAdmin();

      if (admin) {
        await showAdmin();
      } else {
        await loadDashboard();
      }
    } catch (error) {
      console.error("Account verification failed:", error);
      toast("Unable to verify account permissions. Check Firestore rules.");
      showView("authView");
    }
  });
}

$("logoutBtn").onclick = () => signOut(auth);

$("homeBrand").onclick = e => {
  e.preventDefault();
  if (user) loadDashboard();
  else showView("authView");
};

function renderSubjects() {
  $("subjectGrid").innerHTML = Object.entries(curriculum).map(([key,s]) => `
    <article class="subject-card" data-subject="${key}">
      <span class="code">${s.code}</span>
      <h3>${s.title}</h3>
      <p>${s.description}</p>
      <span class="open">Choose review →</span>
    </article>
  `).join("");

  document.querySelectorAll("[data-subject]").forEach(el =>
    el.onclick = () => openSetup(el.dataset.subject)
  );
}

async function loadDashboard() {
  showView("dashboardView");
  $("welcomeName").textContent = user.displayName || "Learner";
  renderSubjects();
  await loadHistory();
}

async function loadHistory() {
  try {
    const snap = await getDocs(query(
      collection(db, "users", user.uid, "attempts"),
      orderBy("createdAt", "desc"),
      limit(8)
    ));

    const rows = snap.docs.map(d => d.data());

    $("attemptCount").textContent = rows.length;

    $("historyList").innerHTML = rows.length
      ? rows.map(a => `
        <div class="history-item">
          <div>
            <b>${escapeHTML(a.subjectTitle)} · ${escapeHTML(a.unitLabel)}</b>
            <span>${escapeHTML(a.mode)} · ${a.correct}/${a.total} correct</span>
          </div>
          <b>${Math.round(a.score)}%</b>
        </div>
      `).join("")
      : '<p class="muted">No completed reviews yet.</p>';

  } catch(e) {
    $("historyList").textContent = "Your review history will appear here after your first completed review.";
  }
}

function openSetup(key) {
  selectedSubject = key;
  const s = curriculum[key];

  $("setupCode").textContent = s.code;
  $("setupTitle").textContent = s.title;
  $("setupDescription").textContent = s.description;

  $("unitSelect").innerHTML = s.units.map(u =>
    `<option value="${u.id}">${u.label}</option>`
  ).join("");

  renderTopics();
  $("unitSelect").onchange = renderTopics;
  showView("setupView");
}

function renderTopics() {
  const u = curriculum[selectedSubject].units.find(
    x => x.id === $("unitSelect").value
  );

  $("topicList").innerHTML = u.topics.map(t =>
    `<span>${escapeHTML(t)}</span>`
  ).join("");
}

$("backDashboard").onclick = loadDashboard;

$("startReview").onclick = () => {
  const unit = $("unitSelect").value;
  const mode = $("modeSelect").value;
  const diff = $("difficultySelect").value;

  let pool = questions.filter(q =>
    q.subject === selectedSubject &&
    q.unit === unit &&
    (diff === "all" || q.difficulty === diff)
  );

  if (mode === "mcq") pool = pool.filter(q => q.type === "mcq");
  if (mode === "fill") pool = pool.filter(q => q.type === "fill");
  if (mode === "flash") pool = pool.filter(q => q.type === "flash");

  if (!pool.length) {
    $("setupMessage").textContent = "There are no questions for this exact format and difficulty yet. Try Mixed difficulty or another format.";
    return;
  }

  pool.sort(() => Math.random() - 0.5);

  const count = Math.min(Number($("countSelect").value), pool.length);
  session = pool.slice(0, count);

  settings = {
    mode,
    unit,
    unitLabel: curriculum[selectedSubject].units.find(x => x.id === unit).label,
    subjectTitle: curriculum[selectedSubject].title,
    itemTimer: $("itemTimer").value,
    sessionTimer: $("sessionTimer").value
  };

  answers = [];
  index = 0;

  showView("reviewView");
  $("reviewSubject").textContent = curriculum[selectedSubject].code;

  startSessionTimer();
  renderQuestion();
};

function stopTimers() {
  clearInterval(itemInterval);
  clearInterval(sessionInterval);
  itemInterval = sessionInterval = null;
}

function startSessionTimer() {
  clearInterval(sessionInterval);

  if (settings.sessionTimer !== "on") return;

  sessionRemaining = session.length *
    (settings.itemTimer === "off" ? 90 : Number(settings.itemTimer));

  sessionInterval = setInterval(() => {
    sessionRemaining--;

    if (sessionRemaining <= 0) {
      stopTimers();
      finishReview(true);
    }
  }, 1000);
}

function startItemTimer() {
  clearInterval(itemInterval);

  if (settings.itemTimer === "off") {
    $("timerDisplay").classList.add("hidden");
    return;
  }

  itemRemaining = Number(settings.itemTimer);
  $("timerDisplay").classList.remove("hidden");

  updateTimer();

  itemInterval = setInterval(() => {
    itemRemaining--;
    updateTimer();

    if (itemRemaining <= 0) {
      clearInterval(itemInterval);

      if (!locked) {
        answers[index] = {
          ...(answers[index] || {}),
          timedOut:true
        };

        reveal(false, true);
      }
    }
  }, 1000);
}

function updateTimer() {
  $("timerDisplay").textContent =
    `00:${String(Math.max(0,itemRemaining)).padStart(2,"0")}`;
}

function renderQuestion() {
  locked = false;

  const q = session[index];

  $("progressText").textContent = `${index+1} / ${session.length}`;
  $("progressBar").style.width = `${(index/session.length)*100}%`;
  $("questionKicker").textContent =
    `QUESTION ${String(index+1).padStart(2,"0")} · ${q.difficulty.toUpperCase()}`;
  $("questionType").textContent = q.kind.toUpperCase();
  $("questionText").textContent = q.q;

  $("feedback").className = "feedback hidden";
  $("feedback").textContent = "";

  $("checkAnswer").classList.toggle("hidden", settings.mode === "flash");
  $("nextQuestion").classList.add("hidden");

  const area = $("answerArea");

  if (settings.mode === "mcq") {
    area.innerHTML = q.options.map((o,i) => `
      <label class="option">
        <input type="radio" name="answer" value="${escapeHTML(o)}">
        <span>${String.fromCharCode(65+i)}. ${escapeHTML(o)}</span>
      </label>
    `).join("");

    area.querySelectorAll(".option").forEach(l => {
      l.onclick = () => {
        area.querySelectorAll(".option").forEach(x =>
          x.classList.remove("selected")
        );
        l.classList.add("selected");
      };
    });

  } else if (settings.mode === "fill") {
    area.innerHTML = '<input id="fillAnswer" class="answer-input" placeholder="Type your answer..." autocomplete="off">';

  } else {
    area.innerHTML = `
      <div class="flash-answer">
        <b>Think of the answer first.</b>
        <p>Tap Reveal to check your understanding.</p>
        <button id="revealFlash" class="button ghost">Reveal answer</button>
        <div id="flashBack" class="hidden">
          <h3>${escapeHTML(q.answer)}</h3>
          <p>${escapeHTML(q.explanation)}</p>
          <button id="flashKnown" class="button primary">I knew it</button>
          <button id="flashMissed" class="button ghost">Need to review</button>
        </div>
      </div>
    `;

    $("revealFlash").onclick = () => {
      $("flashBack").classList.remove("hidden");
      $("revealFlash").classList.add("hidden");
    };

    $("flashKnown").onclick = () => saveFlash(true);
    $("flashMissed").onclick = () => saveFlash(false);
  }

  $("nextQuestion").textContent =
    index === session.length-1 ? "See results →" : "Continue →";

  $("nextQuestion").onclick = () => {
    if (index === session.length-1) {
      finishReview();
    } else {
      index++;
      renderQuestion();
    }
  };

  startItemTimer();
}

function saveFlash(known) {
  if (locked) return;

  locked = true;
  clearInterval(itemInterval);

  const q = session[index];

  answers[index] = {
    given: known ? "Marked as known" : "Marked for review",
    correct: known,
    expected: q.answer,
    explanation: q.explanation
  };

  $("feedback").className = `feedback ${known ? "correct" : "wrong"}`;
  $("feedback").textContent = known
    ? "Marked as known."
    : "Add this concept to your review list.";

  $("nextQuestion").classList.remove("hidden");
}

function check() {
  if (locked) return;

  const q = session[index];
  let given = "";

  if (settings.mode === "mcq") {
    given = document.querySelector('input[name="answer"]:checked')?.value || "";
  } else {
    given = $("fillAnswer").value.trim();
  }

  if (!given) {
    toast("Choose or enter an answer first.");
    return;
  }

  const correct = settings.mode === "fill"
    ? normalize(given) === normalize(q.answer)
    : given === q.answer;

  answers[index] = {
    given,
    correct,
    expected: q.answer,
    explanation: q.explanation
  };

  reveal(correct, false);
}

function normalize(s) {
  return s.toLowerCase().trim()
    .replace(/[.,!?]/g, "")
    .replace(/\s+/g, " ");
}

function reveal(correct, timedOut) {
  locked = true;
  clearInterval(itemInterval);

  const q = session[index];

  $("feedback").className = `feedback ${correct ? "correct" : "wrong"}`;

  $("feedback").innerHTML = correct
    ? `<b>Correct!</b><br>${escapeHTML(q.explanation)}`
    : `<b>${timedOut ? "Time is up." : "Not quite."}</b><br>Correct answer: <b>${escapeHTML(q.answer)}</b><br>${escapeHTML(q.explanation)}`;

  $("checkAnswer").classList.add("hidden");
  $("nextQuestion").classList.remove("hidden");
}

$("checkAnswer").onclick = check;

$("exitReview").onclick = () => {
  if (confirm("Exit this review? Your unfinished attempt will not be saved.")) {
    stopTimers();
    loadDashboard();
  }
};

async function finishReview(timedOut = false) {
  stopTimers();

  const correct = answers.filter(a => a?.correct).length;
  const total = session.length;
  const score = total ? correct/total*100 : 0;

  $("progressBar").style.width = "100%";
  $("resultTitle").textContent = timedOut
    ? "Session time ended"
    : "Review completed";

  $("resultSubtitle").textContent =
    `${settings.subjectTitle} · ${settings.unitLabel}`;

  $("scoreValue").textContent = `${Math.round(score)}%`;

  $("scoreMessage").textContent = score >= 80
    ? "Excellent work!"
    : score >= 60
      ? "Good progress. Keep practicing."
      : "A useful first attempt. Review the explanations below.";

  $("scoreDetail").textContent =
    `You marked ${correct} out of ${total} items correctly.`;

  $("answerReview").innerHTML = session.map((q,i) => {
    const a = answers[i] || {
      given:"No answer recorded",
      correct:false,
      expected:q.answer,
      explanation:q.explanation
    };

    return `
      <div class="answer-review-item">
        <b>${i+1}. ${escapeHTML(q.q)}</b>
        <p class="${a.correct ? "correct-text" : "wrong-text"}">
          ${a.correct ? "✓ Correct" : "✗ Review this"} ·
          Your response: ${escapeHTML(a.given || "No answer")}
        </p>
        <p><b>Correct answer:</b> ${escapeHTML(q.answer)}</p>
        <p>${escapeHTML(q.explanation)}</p>
      </div>
    `;
  }).join("");

  showView("resultsView");

  try {
    await addDoc(collection(db, "users", user.uid, "attempts"), {
      subject:selectedSubject,
      subjectTitle:settings.subjectTitle,
      unit:settings.unit,
      unitLabel:settings.unitLabel,
      mode:settings.mode,
      difficulty:$("difficultySelect").value,
      total,
      correct,
      score,
      answers:session.map((q,i) => ({
        questionId:q.id,
        question:q.q,
        given:answers[i]?.given || "",
        correct:!!answers[i]?.correct,
        expected:q.answer
      })),
      createdAt:serverTimestamp()
    });

  } catch(e) {
    toast("Results shown, but could not save history: " + e.message);
  }
}

$("backAfterResult").onclick = loadDashboard;

// ADMINISTRATOR VERIFICATION
async function isAdmin() {
  if (!user) return false;

  const snap = await getDoc(doc(db, "admins", user.uid));

  return snap.exists();
}

// ADMIN DASHBOARD
async function showAdmin() {
  if (!(await isAdmin())) {
    toast("This account does not have administrator access.");
    return;
  }

  showView("adminView");

  try {
    const users = await getDocs(collection(db, "users"));
    let attempts = [];

    for (const u of users.docs) {
      const a = await getDocs(query(
        collection(db, "users", u.id, "attempts"),
        orderBy("createdAt", "desc")
      ));

      a.docs.forEach(d => attempts.push({
        ...d.data(),
        uid:u.id,
        email:u.data().email
      }));
    }

    attempts.sort((a,b) =>
      (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
    );

    const all = attempts;

    $("adminUsers").textContent = users.size;
    $("adminAttempts").textContent = all.length;

    $("adminAverage").textContent = all.length
      ? `${Math.round(all.reduce((n,a) => n+a.score,0)/all.length)}%`
      : "—";

    $("adminUserList").innerHTML = users.docs.map(d => `
      <div class="history-item">
        <div>
          <b>${escapeHTML(d.data().displayName || "Student")}</b>
          <span>${escapeHTML(d.data().email || "")}</span>
        </div>
        <span>${d.data().role || "student"}</span>
      </div>
    `).join("");

    $("adminAttemptList").innerHTML = all.slice(0,15).map(a => `
      <div class="history-item">
        <div>
          <b>${escapeHTML(a.subjectTitle)} · ${escapeHTML(a.email || "")}</b>
          <span>${a.correct}/${a.total} correct</span>
        </div>
        <b>${Math.round(a.score)}%</b>
      </div>
    `).join("") || "No activity yet.";

  } catch(e) {
    toast("Could not load admin data: " + e.message);
  }
}

$("adminBack").onclick = loadDashboard;

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && $("reviewView").classList.contains("hidden") === false) {
    // Keep review state; exit button is explicit.
  }
});
      
