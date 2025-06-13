import React, { useState, useEffect } from "react";
import Papa from "papaparse";

import { db, storage } from "./firebase";
import { doc, setDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Scores from "./Scores";
import QuizSelector from "./QuizSelector";
import "./styles.css";

const GAME_DOC = "game1";

function getGlossyColor(i) {
  const glossyColors = [
    "rgba(153, 255, 204, 0.75), rgba(0, 102, 68, 0.95)", // Mint Green to Teal
    "rgba(255, 204, 102, 0.75), rgba(204, 102, 0, 0.90)", // Yellow-Orange to Burnt Orange
    "rgba(255, 102, 102, 0.75), rgba(153, 0, 0, 0.90)", // Light Red to Dark Red
    "rgba(204, 153, 255, 0.75), rgba(102, 0, 153, 0.90)", // Lilac to Royal Purple
    //"rgba(255, 153, 255, 0.75), rgba(204, 0, 153, 0.90)", // Hot Pink to Deep Magenta
    "rgba(120, 180, 255, 0.85), rgba(16, 40, 120, 0.95)", // Sky Blue to Deep Blue
    "rgba(192, 192, 192, 0.75), rgba(51, 51, 51, 0.95)", // Silver to Gunmetal
    "rgba(102, 170, 255, 0.75), rgba(0, 0, 204, 0.95)", // Sky Blue to Deep Blue
  ];
  return glossyColors[i % glossyColors.length];
}

// Quizmaster.js (near your imports or top of file)
function getShuffledOrder(length) {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function resolveMediaUrls(questions) {
  const mediaFields = [
    "SOUND",
    "VIDEO",
    "BACKGROUND",
    "sound",
    "video",
    "background",
    "P1",
    "p1",
  ];
  // Add both uppercase and lowercase keys for robustness
  return Promise.all(
    questions.map(async (q) => {
      const qCopy = { ...q };
      for (const field of mediaFields) {
        if (qCopy[field] && !qCopy[field].toLowerCase().startsWith("http")) {
          try {
            const fileRef = ref(storage, "media/" + qCopy[field].trim());
            qCopy[field] = await getDownloadURL(fileRef);
          } catch {
            // If file missing, leave as is or set to null
            qCopy[field] = null;
          }
        }
      }
      return qCopy;
    })
  );
}

async function handleSelect(e) {
  const idx = e.target.value;
  if (!quizzes[idx]) return;
  const fileRef = quizzes[idx];
  const url = await getDownloadURL(fileRef);
  const res = await fetch(url);
  const csv = await res.text();
  Papa.parse(csv, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      // Resolve all media filenames to URLs!
      const fixed = await resolveMediaUrls(results.data);
      onQuizLoaded(fixed);
    },
  });
}

export default function Quizmaster() {
  // ---- State ----
  const [step, setStep] = useState(1); // 1 = pick quiz/upload CSV, 2 = upload media, 3 = quiz controls
  const [questions, setQuestions] = useState([]);
  const [mediaNeeded, setMediaNeeded] = useState([]);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [current, setCurrent] = useState(0);
  const [tab, setTab] = useState("questions");
  const [progress, setProgress] = useState(0);
  const [missingFiles, setMissingFiles] = useState([]);

  const imageFilename = "90s v2.d0df8704-fdfe-4b08-a534-a7ff5c5ad17f.png";
  const [hardcodedUrl, setHardcodedUrl] = useState("");

  const [settings, setSettings] = useState({ questionTimer: 5 }); // or your preferred default
  const [timer, setTimer] = useState(settings.questionTimer); // start timer from settings
  const [timerActive, setTimerActive] = useState(false); // add this!

  const [showTopBar, setShowTopBar] = useState(true);

  useEffect(() => {
    getDownloadURL(ref(storage, "media/" + imageFilename)).then(
      setHardcodedUrl
    );
  }, []);

  useEffect(() => {
    if (!timerActive) return;
    if (timer <= 0) {
      setTimerActive(false);
      updateDoc(doc(db, "games", GAME_DOC), {
        timer: 0,
        timerActive: false,
      });
      return;
    }
    const interval = setInterval(() => {
      setTimer((t) => {
        const next = t - 1;
        updateDoc(doc(db, "games", GAME_DOC), {
          timer: next,
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerActive, timer]);

  //
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "games", GAME_DOC), (snap) => {
      const data = snap.data();
      if (data?.questions) setQuestions(data.questions);
      if (data?.settings) setSettings(data.settings);
      if (typeof data?.current === "number") setCurrent(data.current); // <--- ADD THIS
      if (typeof data?.timer === "number") setTimer(data.timer); // <--- ADD THIS
    });
    return unsub;
  }, []);

  useEffect(() => {
    const handleKeyToggleTopBar = (e) => {
      if (e.key === "ArrowDown") {
        setShowTopBar(false);
      } else if (e.key === "ArrowUp") {
        setShowTopBar(true);
      }
    };

    window.addEventListener("keydown", handleKeyToggleTopBar);
    return () => window.removeEventListener("keydown", handleKeyToggleTopBar);
  }, []);

  // ---- Helpers ----
  function cleanFilename(fname) {
    if (!fname) return "";
    const m = fname.match(/^(.+?\.(mp3|wav|mp4|jpg|jpeg|png|gif))/i);
    return m ? m[1] : fname.split("?")[0];
  }

  function getAllMediaFilenames(questions) {
    const mediaFields = ["sound", "video", "background", "p1"];
    const files = new Set();
    for (const q of questions) {
      for (const field of mediaFields) {
        if (q[field]) files.add(cleanFilename(q[field]));
      }
    }
    return Array.from(files);
  }

  function findFile(fileList, filename) {
    const clean = cleanFilename(filename).toLowerCase();
    return Array.from(fileList).find((f) => f.name.toLowerCase() === clean);
  }

  async function uploadAndReplaceMedia(questions, filesToUpload, setProgress) {
    let count = 0;
    for (const q of questions) {
      for (const field of ["sound", "video", "background", "p1"]) {
        if (q[field]) {
          const baseFile = cleanFilename(q[field]);
          const file = findFile(filesToUpload, baseFile);
          if (file) {
            try {
              const fileRef = ref(storage, `media/${file.name}`);
              await uploadBytes(fileRef, file);
              const url = await getDownloadURL(fileRef);
              q[field] = url;
            } catch (err) {
              console.error("Error uploading file:", file.name, err);
            }
          }
        }
      }
      count++;
      if (setProgress) setProgress(count / questions.length);
    }
    return questions;
  }

  // ---- CSV Handling ----
  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        let qs = results.data
          .filter(
            (q) =>
              q.CAT === "MULTICHOICE" ||
              q.CAT === "MULTIANSWER" ||
              q.CAT === "VANISHING_IMAGE"
          )
          .map((q) => {
            const answers = [q.A1, q.A2, q.A3, q.A4, q.A5, q.A6].filter(
              (a) => !!a
            );
            return {
              question: q.Q,
              answers,
              type: q.CAT,
              sound: q.SOUND,
              video: q.VIDEO,
              background: q.BACKGROUND,
              p1: q.P1,
              answersOrder: getShuffledOrder(answers.length),
            };
          });

        setQuestions(qs);
        const needed = getAllMediaFilenames(qs);
        setMediaNeeded(needed);
        setStep(needed.length ? 2 : 3);
      },
    });
  };

  // ---- Media upload handling ----
  const handleMediaFiles = (e) => {
    const files = e.target.files;
    setMediaFiles(files);
    // Check for any missing files (by name)
    const missing = mediaNeeded.filter((fname) => !findFile(files, fname));
    setMissingFiles(missing);
  };

  const handleUploadAll = async () => {
    let qs = await uploadAndReplaceMedia(questions, mediaFiles, setProgress);

    if (missingFiles.length) {
      alert("You are missing the following files: " + missingFiles.join(", "));
      return;
    }

    try {
      setQuestions(qs);
      await setDoc(doc(db, "games", GAME_DOC), {
        questions: qs,
        current: 0,
        state: "waiting",
      });
      setStep(3);
    } catch (err) {
      console.error("Error during upload or saving quiz:", err);
      alert("Error uploading files or saving quiz: " + err.message);
    }
  };

  const advance = async (by) => {
    const newIdx = Math.min(Math.max(current + by, 0), questions.length - 1);
    setCurrent(newIdx);

    // Start the timer automatically
    const seconds = settings.questionTimer || 20; // use settings or fallback
    setTimer(seconds);
    setTimerActive(true);

    await updateDoc(doc(db, "games", GAME_DOC), {
      current: newIdx,
      timer: seconds,
      timerActive: true,
    });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (tab !== "questions") return; // optional guard
      if (e.key === "ArrowRight") {
        advance(1);
      } else if (e.key === "ArrowLeft") {
        advance(-1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [current, questions.length, tab]);

  // ---- UI Step 1: Select/Upload Quiz ----
  if (step === 1) {
    return (
      <div
        style={{
          minHeight: "100vh",
          width: "100vw",
          margin: 0,
          padding: 0,
          overflow: "hidden",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Step 1: Start a Quiz</h2>
        <QuizSelector
          onQuizLoaded={async (data) => {
            let qs = data
              .filter((q) => q.CAT === "MULTICHOICE" || q.CAT === "MULTIANSWER")
              .map((q) => {
                const answers = [q.A1, q.A2, q.A3, q.A4, q.A5, q.A6].filter(
                  (a) => !!a
                );
                return {
                  question: q.Q,
                  answers,
                  type: q.CAT,
                  sound: q.SOUND,
                  video: q.VIDEO,
                  background: q.BACKGROUND,
                  p1: q.P1,
                  answersOrder: getShuffledOrder(answers.length),
                };
              });

            setQuestions(qs);
            const needed = getAllMediaFilenames(qs);
            setMediaNeeded(needed);
            setStep(3);

            // RESET FIRESTORE STATE FOR NEW QUIZ SELECTION
            await setDoc(doc(db, "games", GAME_DOC), {
              questions: qs,
              current: 0,
              timer: settings.questionTimer || 20,
              timerActive: false,
              state: "waiting",
            });
          }}
        />

        <div style={{ marginTop: 20, color: "#888" }}>
          Or upload a new quiz CSV:
        </div>
        <input type="file" accept=".csv" onChange={handleCSV} />
      </div>
    );
  }

  // ---- UI Step 2: Media Upload ----
  if (step === 2) {
    return (
      <div
        style={{
          minHeight: "100vh",
          width: "100vw",
          margin: 0,
          padding: 0,
          overflow: "hidden",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Step 2: Upload Media Files</h2>
        <p>
          <strong>The following files are needed for your quiz:</strong>
        </p>
        <ul>
          {mediaNeeded.map((fname) => (
            <li key={fname}>
              {fname}
              {missingFiles.includes(fname) ? (
                <span style={{ color: "red" }}> (not selected)</span>
              ) : (
                <span style={{ color: "green" }}> ✓</span>
              )}
            </li>
          ))}
        </ul>
        <input
          type="file"
          accept=".mp3,.wav,.jpg,.jpeg,.png,.gif,.mp4"
          multiple
          onChange={handleMediaFiles}
        />
        {missingFiles.length > 0 && (
          <p style={{ color: "red" }}>Please select all missing files above.</p>
        )}
        <button disabled={missingFiles.length > 0} onClick={handleUploadAll}>
          Upload All & Start Quiz
        </button>
        {progress > 0 && progress < 1 && (
          <div>Uploading... {Math.round(progress * 100)}%</div>
        )}
      </div>
    );
  }

  // ---- UI Step 3: Quiz Controls ----
  // ---- UI Step 3: Quiz Controls ----
  const q = questions[current];
  const displayedAnswers = q.answersOrder
    ? q.answersOrder.map((i) => q.answers[i])
    : q.answers;

  const correctShuffledIndex = q.answersOrder
    ? q.answersOrder.findIndex((i) => i === 0)
    : 0;

  return (
    <div>
      <div
        style={{
          margin: 0,
          padding: 0,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
        }}
      >
        {showTopBar && (
          <div style={{ display: "flex", gap: 8 }}>
            {/* same buttons here */}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setTab("questions")}>Questions</button>
              <button onClick={() => setTab("scores")}>Scores</button>
              <button onClick={() => setTab("settings")}>Settings</button>
              <button onClick={() => advance(-1)} disabled={current === 0}>
                ⬅ Previous
              </button>
              <button
                onClick={() => advance(1)}
                disabled={current === questions.length - 1}
              >
                Next ➡
              </button>
            </div>
          </div>
        )}

        {/* Move this OUTSIDE the container and ALWAYS render */}
        {q.sound && (
          <audio
            src={q.sound}
            autoPlay
            controls
            style={{
              position: "fixed",
              bottom: 20,
              left: 20,
              zIndex: 1000,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              borderRadius: "8px",
              padding: "4px",
            }}
          />
        )}

        {/* Timer display */}
        <div
          style={{
            position: "absolute",
            top: 120,
            right: 40,
            fontWeight: 900,
            fontSize: "4.2rem",
            color: timer === 0 ? "#ff4444" : "#ffffff",
            textShadow: "2px 2px 6px #000, 0 0 12px rgba(255,255,255,0.6)",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            padding: "0.4em 0.8em",
            borderRadius: "0.6em",
            zIndex: 100,
          }}
        >
          {timer > 0 ? `⏰ ${timer}s` : "⏰ Time's Up!"}
        </div>
      </div>

      <hr />

      {tab === "questions" && (
        <div
          style={{
            width: "100vw",
            height: "100vh",
            overflow: "hidden",
            background: q.background
              ? `url(${settings.background}) center center / cover no-repeat`
              : "#222",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            aspectRatio: "4/3",
          }}
        >
          <div className="question-prompt">
            Q{current + 1}: {q.question}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "stretch", // key: both columns are stretched to max height
              width: "90vw",
              maxWidth: "90vw",
              gap: q.p1 ? "40px" : "0",
              minHeight: "60vh", // add a minimum height for alignment
            }}
          >
            {/* Answers column */}
            <div
              style={{
                flex: 2,
                display: "flex",
                flexDirection: "column",
                alignItems: q.p1 ? "flex-end" : "center", // right-align with image
                justifyContent: "center",
                height: "100%", // stretch to match image
              }}
            >
              <ol
                type="A"
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "22px",
                  width: "100%",
                }}
              >
                {q.answersOrder
                  ? q.answersOrder.map((answerIdx, displayIdx) => (
                      <li
                        key={displayIdx}
                        style={{
                          width: "100%",
                          display: "flex",
                          justifyContent: "center",
                        }}
                      >
                        <div
                          className={`answer-option option-${String.fromCharCode(
                            65 + displayIdx
                          ).toLowerCase()}${
                            timer === 0 && displayIdx === correctShuffledIndex
                              ? " correct pulse-correct"
                              : ""
                          }`}
                          style={{
                            cursor: "default",
                            pointerEvents: "none",
                            fontSize: "3rem",
                            fontWeight: "800",
                            padding: ".2em 1em",
                            width: "40vw",
                            textAlign: "center",
                            borderRadius: "3em",

                            userSelect: "none",
                            boxShadow:
                              "inset 0 2px 4px rgba(255,255,255,0.6), inset 0 -2px 6px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.5)",
                            background: `linear-gradient(to bottom, ${getGlossyColor(
                              displayIdx
                            )})`,
                            color: "#111",
                            transition: "all 0.25s ease-in-out",
                          }}
                        >
                          {q.answers[answerIdx]}
                        </div>
                      </li>
                    ))
                  : q.answers.map((a, i) => (
                      <li
                        key={i}
                        style={{
                          width: "100%",
                          display: "flex",
                          justifyContent: "center",
                        }}
                      >
                        <div
                          className={`answer-option option-${String.fromCharCode(
                            65 + i
                          ).toLowerCase()}${
                            timer === 0 && i === correctShuffledIndex
                              ? " correct pulse-correct"
                              : ""
                          }`}
                          style={{
                            cursor: "default",
                            pointerEvents: "none",
                            fontSize: "3rem",
                            fontWeight: "800",
                            padding: ".2em 1em",
                            width: "40vw",
                            textAlign: "center",
                            borderRadius: "3em",

                            userSelect: "none",
                            boxShadow:
                              "inset 0 2px 4px rgba(255,255,255,0.6), inset 0 -2px 6px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.5)",
                            background: `linear-gradient(to bottom, ${getGlossyColor(
                              i
                            )})`,
                            color: "#111",
                            transition: "all 0.25s ease-in-out",
                          }}
                        >
                          {a}
                        </div>
                      </li>
                    ))}
              </ol>
            </div>

            {/* Image column */}
            {q.p1 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "none",
                  padding: 0,
                  minWidth: "420px",
                  maxWidth: "480px",
                  width: "24vw",
                  // Remove any fixed height or minHeight here!
                }}
              >
                <img
                  src={q.p1}
                  alt="Question visual"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "70vh",
                    width: "auto",
                    height: "auto",
                    objectFit: "contain",
                    borderRadius: "14px",
                    background: "#222",
                    border: "3px solid #111", // This is a neat small border
                    boxShadow: "0 4px 18px rgba(0,0,0,0.5)",
                    display: "block",
                  }}
                />
              </div>
            )}
          </div>

          {/* Optional video below */}
          {q.video && (
            <video
              controls
              width="320"
              src={q.video}
              style={{
                marginTop: 20,
                borderRadius: "12px",
                boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
              }}
            />
          )}
        </div>
      )}

      {tab === "scores" && <Scores numQuestions={questions.length} />}

      {tab === "settings" && (
        <div
          style={{
            width: "100vw",
            minHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            background: "#222",
            color: "#fff",
            fontSize: "2rem",
            paddingTop: "3em",
          }}
        >
          <h2 style={{ marginBottom: "1em" }}>Settings</h2>

          {/* TIMER SETTING */}
          <div style={{ marginBottom: "1em" }}>
            <label>
              Question Timer:&nbsp;
              <input
                type="number"
                min="5"
                max="120"
                value={settings.questionTimer}
                onChange={(e) => {
                  const val = Math.max(
                    5,
                    Math.min(120, Number(e.target.value))
                  );
                  setSettings((s) => ({ ...s, questionTimer: val }));
                }}
                style={{
                  fontSize: "1.5rem",
                  borderRadius: "0.4em",
                  border: "2px solid #fff",
                  padding: "0.2em 0.5em",
                  width: "4em",
                }}
              />
              &nbsp;seconds
            </label>
            <button
              style={{
                marginLeft: "1em",
                fontSize: "1rem",
                borderRadius: "0.4em",
                border: "2px solid #fff",
                padding: "0.2em 1em",
              }}
              onClick={async () => {
                await updateDoc(doc(db, "games", GAME_DOC), {
                  settings: {
                    ...(settings || {}),
                    questionTimer: settings.questionTimer,
                  },
                });
                alert("Timer saved!");
              }}
            >
              Save Timer
            </button>
          </div>

          {/* BACKGROUND IMAGE UPLOAD/URL */}
          <div style={{ marginBottom: "2em" }}>
            <label>
              Background Image:&nbsp;
              <input
                type="text"
                value={settings.background || ""}
                placeholder="Paste image URL or upload below"
                onChange={(e) =>
                  setSettings((s) => ({ ...s, background: e.target.value }))
                }
                style={{
                  fontSize: "1.2rem",
                  borderRadius: "0.4em",
                  border: "2px solid #fff",
                  padding: "0.2em 0.5em",
                  width: "24em",
                }}
              />
            </label>
            <input
              type="file"
              accept="image/*"
              style={{ marginLeft: "1em" }}
              onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const fileRef = ref(storage, `media/${file.name}`);
                await uploadBytes(fileRef, file);
                const url = await getDownloadURL(fileRef);
                setSettings((s) => ({ ...s, background: url }));
              }}
            />
            <button
              style={{
                marginLeft: "1em",
                fontSize: "1rem",
                borderRadius: "0.4em",
                border: "2px solid #fff",
                padding: "0.2em 1em",
              }}
              onClick={async () => {
                await updateDoc(doc(db, "games", GAME_DOC), {
                  settings: {
                    ...(settings || {}),
                    background: settings.background,
                  },
                });
                alert("Background saved!");
              }}
            >
              Save Background
            </button>
          </div>

          {/* PREVIEW */}
          {settings.background && (
            <img
              src={settings.background}
              alt="Quiz Background Preview"
              style={{
                maxWidth: "40vw",
                maxHeight: "40vh",
                borderRadius: "1em",
                border: "2px solid #fff",
                boxShadow: "0 4px 18px #000c",
                marginTop: "1em",
              }}
            />
          )}
        </div>
      )}
    </div> // <-- This closes the outer return <div>
  );
} // <-- This closes the Quizmaster function
