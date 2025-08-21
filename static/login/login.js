const toggle = document.getElementById('togglePassword');
const senha = document.getElementById('senha');

toggle.addEventListener('click', () => {
    // Alterna o type
    const oculto = senha.type === 'password';
    senha.type = oculto ? 'text' : 'password';

    // Alterna o ícone
    const icon = toggle.querySelector('i');
    icon.classList.toggle('bi-eye');
    icon.classList.toggle('bi-eye-slash');
});