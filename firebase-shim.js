// Firebase shim - re-exports Firebase SDK from CDN
export { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
export { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, limit, getDocs, getCountFromServer, addDoc, serverTimestamp, deleteDoc, writeBatch, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
