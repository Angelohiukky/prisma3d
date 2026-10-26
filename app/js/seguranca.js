import { auth, onAuthStateChanged, signOut } from './firebase-config.js';

/**
 * Protege a página exigindo autenticação do Firebase.
 * Se não autenticado, redireciona para login.html.
 */
export function protegerPagina(onUserAuthenticated) {
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = 'login.html';
        } else {
            document.body.style.display = 'flex';
            const welcomeMsg = document.getElementById('welcome-msg');
            if (welcomeMsg) {
                const nomeUsuario = user.displayName || user.email.split('@')[0];
                welcomeMsg.innerHTML = `Olá, <strong>${escapeHtml(nomeUsuario)}</strong>`;
            }
            if (onUserAuthenticated) {
                onUserAuthenticated(user);
            }
        }
    });
}

/**
 * Encerra a sessão e redireciona para login
 */
export function encerrarSessao() {
    signOut(auth).then(() => {
        window.location.href = 'login.html';
    }).catch(err => {
        console.error('Erro ao sair:', err);
        window.location.href = 'login.html';
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[m];
    });
}
