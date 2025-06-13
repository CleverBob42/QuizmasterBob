// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// src/firebase.js
const firebaseConfig = {
  apiKey: "AIzaSyC-LCmeTfRy5f82FREA56GDskLk41WU1DF8",
  authDomain: "bobquiz-272a7.firebaseapp.com",
  projectId: "bobquiz-272a7",
  storageBucket: "bobquiz-272a7.firebasestorage.app", // <--- CHANGE THIS LINE!
  messagingSenderId: "386315802426",
  appId: "1:386315802426:web:8f0711e4365f135bcbb3",
  measurementId: "G-CTEVK7FHJ",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
