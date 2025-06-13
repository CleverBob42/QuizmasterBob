import React, { useState, useEffect, useRef } from "react";
import { db, storage } from "./firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import "./styles.css";

const GAME_DOC = "game1";

const glossyColor = [
  "linear-gradient(135deg, rgba(153, 255, 204, 0.75), rgba(0, 102, 68, 0.95))", // Mint Green to Teal
  "linear-gradient(135deg, rgba(255, 204, 102, 0.75), rgba(204, 102, 0, 0.90))", // Yellow-Orange to Burnt Orange
  "linear-gradient(135deg, rgba(255, 102, 102, 0.75), rgba(153, 0, 0, 0.90))", // Light Red to Dark Red
  "linear-gradient(135deg, rgba(204, 153, 255, 0.75), rgba(102, 0, 153, 0.90))", // Lilac to Royal Purple
  "linear-gradient(135deg, rgba(120, 180, 255, 0.85), rgba(16, 40, 120, 0.95))", // Sky Blue to Deep Blue
  "linear-gradient(135deg, rgba(192, 192, 192, 0.75), rgba(51, 51, 51, 0.95))", // Silver to Gunmetal
  "linear-gradient(135deg, rgba(102, 170, 255, 0.75), rgba(0, 0, 204, 0.95))", // Sky Blue to Deep Blue
];

export default function Player() {
  const [game, setGame] = useState(null);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState([]);
  const [answered, setAnswered] = useState(false);
  const [team, setTeam] = useState("");
  const [selfieUrl, setSelfieUrl] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [timer, setTimer] = useState(0);

  // Selfie file state
  const [selfieFile, setSelfieFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef();

  // Listen for live game state
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "games", GAME_DOC), (snap) => {
      const data = snap.data();
      setGame(data);
      setCurrent(data?.current ?? 0);
      setTimer(data?.timer ?? 0);
    });
    return unsub;
  }, []);

  useEffect(() => {
    setAnswered(false);
    setSelected([]);
    setFeedback(null);
  }, [current]);

  useEffect(() => {
    if (timer === 0 && !answered && team) {
      handleSubmit();
    }
    // eslint-disable-next-line
  }, [timer]);

  if (!game) return <div>Waiting for quiz to start...</div>;

  const q = game.questions[current];

  const displayedAnswers = q.answersOrder
    ? q.answersOrder.map((i) => q.answers[i])
    : q.answers;
  const correctShuffledIndex = q.answersOrder
    ? q.answersOrder.findIndex((i) => i === 0)
    : 0;

  if (!q) return <div>Waiting for next question...</div>;

  // Properly determine correctIndexes (single or multiple correct answers)
  let correctIndexes = [];
  if ("correctAnswer" in q) {
    correctIndexes = [q.correctAnswer];
  } else if ("correctAnswers" in q) {
    correctIndexes = q.correctAnswers;
  }

  const isMulti = q.type === "MULTIANSWER";

  // Check correctness (for feedback)
  function isCorrect(selected, q) {
    if (q.type === "MULTICHOICE") {
      // Use the shuffled correct index!
      return selected.length === 1 && selected[0] === correctShuffledIndex;
    }
    if (q.type === "MULTIANSWER") {
      // Add your multianswer logic here as needed
      return false; // or your real logic
    }
    return false;
  }

  // New: Handle selfie file upload & team join
  const handleJoin = async () => {
    const teamName = inputRef.current.value.trim();
    if (!teamName) {
      alert("Enter a team name!");
      return;
    }
    if (!selfieFile) {
      alert("Please upload a team selfie!");
      return;
    }
    setUploading(true);
    try {
      // Upload selfie to Firebase Storage
      const selfieRef = ref(storage, `selfies/${GAME_DOC}/${teamName}.jpg`);
      await uploadBytes(selfieRef, selfieFile);
      const downloadURL = await getDownloadURL(selfieRef);
      setSelfieUrl(downloadURL);

      // Save team info (with selfie URL) in Firestore
      await setDoc(doc(db, "games", GAME_DOC, "teams", teamName), {
        team: teamName,
        selfieUrl: downloadURL,
        joinedAt: Date.now(),
      });

      setTeam(teamName);
    } catch (err) {
      alert("Failed to upload selfie: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!team) {
      alert("Enter a team name!");
      return;
    }
    const correct = isCorrect(selected, q);
    setFeedback(correct ? "Correct!" : "Incorrect.");
    setAnswered(true);

    // Store answer in Firestore
    await setDoc(doc(db, "games", GAME_DOC, "answers", `${current}-${team}`), {
      team,
      q: current,
      answer: selected,
      correct,
      points: correct ? 10 : 0, // static 10-point scoring for now
      time: Date.now(),
    });
  };

  return (
    <div>
      {!team && (
        <div>
          <input
            placeholder="Enter team name"
            ref={inputRef}
            disabled={uploading}
          />
          <br />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setSelfieFile(e.target.files[0])}
            disabled={uploading}
          />
          {selfieFile && (
            <div style={{ margin: "8px 0" }}>
              <img
                src={URL.createObjectURL(selfieFile)}
                alt="Team Selfie Preview"
                style={{ width: 120, borderRadius: 12, marginTop: 8 }}
              />
            </div>
          )}
          <button onClick={handleJoin} disabled={uploading}>
            {uploading ? "Uploading..." : "Join"}
          </button>
        </div>
      )}
      {team && (
        <div
          style={{
            position: "fixed", // Fill viewport, fix to top/left
            top: 0,
            left: 0,
            minHeight: "100vh",
            //minWidth: "100%",
            background: "#e3f0fc", // Pale blue; adjust as needed
            //position: "relative", // <- THIS LINE IS THE FIX!
            margin: 0,
            padding: 0,
            overflow: "auto", // Scroll if needed
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* --- TIMER DISPLAY BLOCK --- */}
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 48,
              fontWeight: 700,
              fontSize: 28,
              letterSpacing: 1.5,
              textAlign: "right",
              transition: "color 0.25s",
              zIndex: 10,
              background: "rgba(255,255,255,0.0)",
              padding: "0.3em 1em",
              borderRadius: "2em",
              color: timer > 0 && timer <= 5 ? "#e53935" : "#2377ff",
            }}
          >
            {timer > 0 ? (
              <>⏰ {timer}s</>
            ) : timer === 0 ? (
              <span style={{ color: "#e53935" }}>⏰ Time's Up!</span>
            ) : (
              ""
            )}
          </div>

          {/* --- END TIMER DISPLAY BLOCK --- */}

          <div
            className="question-prompt"
            style={{
              fontSize: "1.5rem", // Make it smaller than before
              padding: "0.20em 0.20em", // Reduce padding
              width: "95%", // Makes the button fill most of the container’s width
              borderRadius: "1em", // Rounds the corners of the button (bigger value = more pill-shaped)
              lineHeight: "1.13", // Tighter line height
              textAlign: "center",
              marginTop: "60px",
              marginBottom: "20px", // Add a bit more spacing below
              fontWeight: 700,
            }}
          >
            Q{current + 1}: {q.question.replace(/^\{Q\}/, "")}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <ol
              type="A"
              style={{
                width: "100%", // [ADDED]
                //maxWidth: 480,                // [ADDED] (you can adjust as needed)
                margin: "0 auto", // [ADDED]
                padding: 0, // [ADDED]
                display: "flex", // [ADDED]
                flexDirection: "column", // [ADDED]
                alignItems: "center", // [ADDED]
                //gap: "0.6em", // [ADDED for spacing]
              }}
            >
              {q.answersOrder
                ? q.answersOrder.map((answerIdx, displayIdx) => (
                    <li
                      key={displayIdx}
                      style={{
                        listStyle: "none",
                        width: "100%", // [ADDED]
                        display: "flex", // [ADDED]
                        justifyContent: "center", // [ADDED]
                        margin: 0,
                        padding: 0,
                      }}
                    >
                      <label
                        className={
                          "answer-option" +
                          " option-" +
                          String.fromCharCode(65 + displayIdx).toLowerCase() +
                          (timer === 0 && displayIdx === correctShuffledIndex
                            ? " correct pulse-correct"
                            : answered && displayIdx === correctShuffledIndex
                            ? " correct"
                            : "") +
                          (answered &&
                          selected.includes(displayIdx) &&
                          displayIdx !== correctShuffledIndex
                            ? " incorrect"
                            : "") +
                          (!answered && selected.includes(displayIdx)
                            ? " selected"
                            : "")
                        }
                        style={{
                          background:
                            glossyColor[displayIdx % glossyColor.length], // Button's glossy gradient background (overrides CSS if set here)
                          fontWeight: 900, // Makes the button text very bold
                          //fontSize: "2.5rem", // Controls the size of the button text (bigger = larger text)
                          //padding: "1.3em .2em", // Vertical (1.1em) and horizontal (1.2em) space inside button – makes buttons thicker/wider
                          borderRadius: "3em", // Rounds the corners of the button (bigger value = more pill-shaped)
                          marginBottom: "4px", // Space below each button
                          minHeight: ".8em", // Minimum vertical size of the button (never gets smaller than this)
                          //display: "flex", // Enables flex layout for button content (e.g., for centering)
                          alignItems: "center", // Vertically centers text/icons inside the button
                          boxShadow:
                            "inset 0 2px 4px rgba(255,255,255,0.6)," + // Top inner shadow (white highlight)
                            "inset 0 -2px 6px rgba(0,0,0,0.3)," + // Bottom inner shadow (darker, for 3D look)
                            "0 4px 12px rgba(0,0,0,0.5)", // Drop shadow outside (gives lift effect)
                          transition: "all 0.22s cubic-bezier(.42,.0,.58,1)", // Smooth animation for hover/selection/changes
                          width: "90vw", // Makes the button fill most of the container’s width
                          //justifyContent: "flex-start",              // (Optional) Aligns text/icons to the left inside the button
                          textAlign: "center", // Centers text inside the button (when not using justifyContent)
                          fontFamily:
                            "'Montserrat', Arial, Helvetica, sans-serif", // Font used for button text
                        }}
                      >
                        <input
                          type={isMulti ? "checkbox" : "radio"}
                          name="ans"
                          value={displayIdx}
                          checked={selected.includes(displayIdx)}
                          disabled={answered}
                          onChange={(e) => {
                            if (answered || timer === 0) return;
                            if (isMulti) {
                              setSelected((sel) =>
                                e.target.checked
                                  ? [...sel, displayIdx]
                                  : sel.filter((idx) => idx !== displayIdx)
                              );
                            } else {
                              setSelected([displayIdx]);
                            }
                          }}
                          style={{ display: "none" }}
                        />

                        <span
                          style={{ fontWeight: "bold", marginRight: 8 }}
                        ></span>
                        {q.answers[answerIdx]}
                      </label>
                    </li>
                  ))
                : q.answers.map((a, i) => (
                    <li
                      key={i}
                      style={{ listStyle: "none", padding: 0, margin: 0 }}
                    >
                      <label
                        className={
                          "answer-option option-" +
                          String.fromCharCode(65 + i).toLowerCase() +
                          (timer === 0 && i === correctShuffledIndex
                            ? " correct pulse-correct"
                            : answered && i === correctShuffledIndex
                            ? " correct"
                            : "") +
                          (answered &&
                          selected.includes(i) &&
                          i !== correctShuffledIndex
                            ? " incorrect"
                            : "") +
                          (!answered && selected.includes(i) ? " selected" : "")
                        }
                        style={{
                          fontWeight: 800,
                          fontSize: "3rem",
                          padding: ".5em .5em",
                          borderRadius: "3em",
                          marginBottom: "5px",
                          minHeight: "3em",
                          display: "flex",
                          alignItems: "center",
                          boxShadow:
                            "inset 0 2px 4px rgba(255,255,255,0.6), inset 0 -2px 6px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.5)",
                          transition: "all 0.22s cubic-bezier(.42,.0,.58,1)",
                          width: "90vw",
                          justifyContent: "flex-start",
                          textAlign: "center",
                          fontFamily:
                            "'Montserrat', Arial, Helvetica, sans-serif",
                        }}
                      >
                        <input
                          type={isMulti ? "checkbox" : "radio"}
                          name="ans"
                          value={i}
                          checked={selected.includes(i)}
                          disabled={answered}
                          onChange={(e) => {
                            if (answered || timer === 0) return;
                            if (isMulti) {
                              setSelected((sel) =>
                                e.target.checked
                                  ? [...sel, i]
                                  : sel.filter((idx) => idx !== i)
                              );
                            } else {
                              setSelected([i]);
                            }
                          }}
                          style={{ display: "none" }}
                        />

                        <span
                          style={{ fontWeight: "bold", marginRight: 8 }}
                        ></span>
                        {a}
                      </label>
                    </li>
                  ))}
            </ol>
          </form>
        </div>
      )}
    </div>
  );
}
