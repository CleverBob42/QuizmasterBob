import React, { useState, useEffect } from "react";
import { db, storage } from "./firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";

const GAME_DOC = "game1";

export default function Scores({ numQuestions }) {
  const [answers, setAnswers] = useState([]);
  const [scores, setScores] = useState([]);
  const [teamInfo, setTeamInfo] = useState({});
  const [bgUrl, setBgUrl] = useState(null);

  // Load background image
  useEffect(() => {
    getDownloadURL(ref(storage, "media/90strivia.png"))
      .then(setBgUrl)
      .catch((err) => console.error("Failed to load background image:", err));
  }, []);

  // Listen for answers
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "games", GAME_DOC, "answers"),
      (snap) => {
        const all = [];
        snap.forEach((doc) => all.push(doc.data()));
        setAnswers(all);
      }
    );
    return unsub;
  }, []);

  // Listen for teams & their selfies
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "games", GAME_DOC, "teams"),
      (snap) => {
        const info = {};
        snap.forEach((doc) => {
          const data = doc.data();
          info[data.team] = data.selfieUrl || null;
        });
        setTeamInfo(info);
      }
    );
    return unsub;
  }, []);

  // Calculate team scores
  useEffect(() => {
    // Only include current teams (from teamInfo)
    const currentTeams = new Set(Object.keys(teamInfo));
    const scoreByTeam = {};
    answers.forEach((a) => {
      if (!currentTeams.has(a.team)) return; // Ignore teams not in the current game
      if (!scoreByTeam[a.team]) scoreByTeam[a.team] = 0;
      scoreByTeam[a.team] += a.points;
    });

    const sorted = Object.entries(scoreByTeam)
      .filter(([, score]) => !isNaN(score))
      .sort((a, b) => b[1] - a[1]);

    setScores(sorted);
  }, [answers, teamInfo]);

  // For endless marquee: duplicate the list (so the scroll can wrap smoothly)
  const doubledScores = [...scores, ...scores];

  const getRankPrefix = (index) => {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return `${index + 1}.`;
  };

  // MUCH BIGGER selfie vertical card and bigger font
  const CARD_WIDTH = 384;
  const CARD_HEIGHT = 576;
  const CARD_GAP = 80;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: bgUrl
          ? `url("${bgUrl}") center center / cover no-repeat`
          : "#111",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        fontFamily: "sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Heading */}
      <div
        className="answer-option question-prompt"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          backdropFilter: "blur(8px)",
          border: "3px solid #fff",
          borderRadius: "2em",
          padding: "1.4em 2em",
          marginTop: 40,
          marginBottom: 30,
          width: "100%",
          maxWidth: 800,
          fontSize: "3rem",
          fontWeight: 700,
          color: "#fff",
          textAlign: "center",
          boxShadow: "0 2px 18px 0 #0008",
        }}
      >
        🏆 Current Scores
      </div>

      {/* Marquee/Scroll Area */}
      <div
        style={{
          width: "100vw",
          height: CARD_HEIGHT + 120,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          className="scroll-row"
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: CARD_GAP,
            width: doubledScores.length * (CARD_WIDTH + CARD_GAP),
            animation: `marquee-scroll ${
              scores.length === 0 ? 0 : doubledScores.length * 12
            }s linear infinite`,
          }}
        >
          {doubledScores.map(([team, score], idx) => {
            const selfieUrl = teamInfo[team];
            const globalRank = idx % scores.length; // 0-based, wraps around
            return (
              <div
                key={team + idx}
                style={{
                  width: CARD_WIDTH,
                  minWidth: CARD_WIDTH,
                  maxWidth: CARD_WIDTH,
                  height: CARD_HEIGHT,
                  borderRadius: "2.2em",
                  background: "rgba(0,0,0,0.80)",
                  boxShadow: "0 12px 64px #000b, 0 0 0 7px #fff4",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Selfie: vertical aspect */}
                <div
                  style={{
                    width: CARD_WIDTH,
                    height: CARD_HEIGHT - 180,
                    borderRadius: "2em 2em 1.1em 1.1em",
                    overflow: "hidden",
                    background: "#333d",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {selfieUrl ? (
                    <img
                      src={selfieUrl}
                      alt={team + " selfie"}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        borderRadius: "2em 2em 1.1em 1.1em",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff7",
                        fontSize: "6.5rem",
                        background: "#222c",
                      }}
                    >
                      👥
                    </div>
                  )}
                </div>
                {/* Team Data */}
                <div
                  style={{
                    width: "100%",
                    textAlign: "center",
                    marginTop: 28,
                    fontSize: "2.7rem",
                    fontWeight: 800,
                    color: "#fff",
                    textShadow: "0 4px 18px #000b",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 16,
                    letterSpacing: 2,
                  }}
                >
                  <span style={{ fontSize: "2.7rem" }}>
                    {getRankPrefix(globalRank)}
                  </span>
                  <span
                    style={{
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      maxWidth: 300,
                      fontSize: "2.7rem",
                    }}
                  >
                    {team}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "2.8rem",
                    color: "#ffd600",
                    fontWeight: 900,
                    width: "100%",
                    textAlign: "center",
                    marginTop: 16,
                    textShadow: "0 2px 14px #000a",
                  }}
                >
                  {typeof score === "number" ? score : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 36,
          width: "100%",
          textAlign: "center",
          fontSize: "1.7rem",
          color: "#eee",
          textShadow: "0 0 8px rgba(0,0,0,0.7)",
          letterSpacing: 0.5,
        }}
      ></div>
      {/* Keyframes for marquee scroll */}
      <style>
        {`
        @keyframes marquee-scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .scroll-row {
          will-change: transform;
        }
        @media (max-width: 1000px) {
          .scroll-row > div {
            width: 200px !important;
            min-width: 200px !important;
            max-width: 200px !important;
            height: 320px !important;
          }
          .scroll-row > div > div:first-child {
            height: 160px !important;
          }
          .scroll-row > div > div:nth-child(2),
          .scroll-row > div > div:nth-child(3) {
            font-size: 1.2rem !important;
          }
        }
        `}
      </style>
    </div>
  );
}
