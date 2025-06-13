import React, { useEffect, useState } from "react";
import { storage } from "./firebase";
import { listAll, ref, getDownloadURL } from "firebase/storage";
import Papa from "papaparse";

function getShuffledOrder(length) {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function QuizSelector({ onQuizLoaded }) {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // List CSVs from /quizzes folder in Firebase Storage
    async function fetchQuizzes() {
      try {
        const folderRef = ref(storage, "quizzes/");
        const res = await listAll(folderRef);
        setQuizzes(res.items);
      } catch (e) {
        alert("Could not fetch quizzes: " + e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchQuizzes();
  }, []);

  // Put this at the top of QuizSelector.js (before your component)

  async function resolveMediaUrls(questions, storage) {
    const mediaFields = [
      "SOUND",
      "VIDEO",
      "BACKGROUND",
      "sound",
      "video",
      "background",
      "P1",
    ];
    return Promise.all(
      questions.map(async (q) => {
        const qCopy = { ...q };
        for (const field of mediaFields) {
          const val = qCopy[field];
          if (val && !String(val).toLowerCase().startsWith("http")) {
            // Only use the filename up to the extension
            let cleaned = String(val)
              .trim()
              .replace(/^(.+?\.(mp3|wav|mp4|jpg|jpeg|png|gif)).*$/i, "$1");

            try {
              const fileRef = ref(storage, "media/" + cleaned);
              qCopy[field] = await getDownloadURL(fileRef);
            } catch (err) {
              console.warn("FAILED to find:", "media/" + cleaned, err);
              qCopy[field] = null;
            }
          }
        }
        return {
          ...qCopy,
          sound: qCopy.SOUND || qCopy.sound || null,
          video: qCopy.VIDEO || qCopy.video || null,
          background: qCopy.BACKGROUND || qCopy.background || null,
          p1: qCopy.P1 || qCopy.p1 || null,
        };
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
        // Include all desired CAT types
        // DEBUG: Print every CAT value and the Q for that row

        const mapped = results.data
          .filter((q) => {
            const cat = (q.CAT || q.cat || "").trim().toUpperCase();
            return (
              cat === "MULTICHOICE" ||
              cat === "MULTIANSWER" ||
              cat === "VANISHING_IMAGE"
            );
          })
          .map((q) => {
            const answers = [q.A1, q.A2, q.A3, q.A4, q.A5, q.A6].filter(
              (a) => !!a
            );
            return {
              ...q,
              question: q.Q || q.question,
              type: q.CAT || q.type,
              sound: q.SOUND || q.sound || "",
              video: q.VIDEO || q.video || "",
              background: q.BACKGROUND || q.background || "",
              p1: q.P1 || "",
              answers,
              answersOrder: getShuffledOrder(answers.length),
            };
          }); // <--- YOU WERE MISSING THIS CLOSE!

        const fixed = await resolveMediaUrls(mapped, storage);
        onQuizLoaded(fixed);
      },
    });
  }

  if (loading) return <div>Loading quizzes...</div>;
  if (!quizzes.length) return <div>No uploaded quizzes found.</div>;

  return (
    <div>
      <label>
        Select quiz:&nbsp;
        <select defaultValue="" onChange={handleSelect}>
          <option value="" disabled>
            -- Choose --
          </option>
          {quizzes.map((q, idx) => (
            <option value={idx} key={q.fullPath}>
              {q.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
