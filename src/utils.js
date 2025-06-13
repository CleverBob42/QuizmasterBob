import Papa from "papaparse";

// Parse a QuizXpress CSV file
export function parseQuizCSV(file, callback) {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      // Only questions with CAT == MULTICHOICE or MULTIANSWER
      const questions = results.data
        .filter((q) => q.CAT === "MULTICHOICE" || q.CAT === "MULTIANSWER")
        .map((q) => ({
          question: q.Q,
          answers: [q.A1, q.A2, q.A3, q.A4, q.A5, q.A6].filter((a) => !!a),
          type: q.CAT,
          sound: q.SOUND,
          video: q.VIDEO,
          background: q.BACKGROUND,
          p1: q.P1,
        }));
      callback(questions);
    },
  });
}
