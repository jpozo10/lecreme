const SUPABASE_URL = 'https://yimihpnzkpvqizojpewk.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpbWlocG56a3B2cWl6b2pwZXdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MTY3MzgsImV4cCI6MjA5NzM5MjczOH0.HUP_v4ltaoE7lYvl2sL4-R_Pf-XJ9A8vnUw9ZCJlJsA';

// Hacemos que el cliente de Supabase sea global en la ventana del navegador
window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Mantenemos la constante local apuntando a la global para asegurar compatibilidad con app.js y admin.js
const sb = window.sb;
