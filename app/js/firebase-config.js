import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    query,
    onSnapshot,
    orderBy,
    serverTimestamp,
    doc,
    deleteDoc,
    updateDoc,
    where,
    getDocs,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

// Configuração Oficial do Firebase do usuário (reutilizando a conta ativa)
const firebaseConfig = {
    apiKey: "AIzaSyBwSUFBXaHKB000dnJa1n6Qu98PIENJOOI",
    authDomain: "raizcode-login.firebaseapp.com",
    projectId: "raizcode-login",
    storageBucket: "raizcode-login.firebasestorage.app",
    messagingSenderId: "626900110544",
    appId: "1:626900110544:web:e0f08b0748fa05b585e2d5",
    measurementId: "G-QM2Y8028NP"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Nomes das Coleções do Sistema Prisma 3D
export const COLS = {
    PEDIDOS: 'prisma_pedidos',
    CLIENTES: 'prisma_clientes',
    INSUMOS: 'prisma_insumos',
    PAGAMENTOS: 'prisma_pagamentos'
};

export {
    auth,
    db,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    collection,
    addDoc,
    query,
    onSnapshot,
    orderBy,
    serverTimestamp,
    doc,
    deleteDoc,
    updateDoc,
    where,
    getDocs,
    getDoc
};
