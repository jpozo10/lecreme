
const BUCKET_NAME = 'Menu';
const FALLBACK_IMG = 'https://i.imgur.com/LohlUtN.png';

let categoriasCache = {};
let productosCache = {};
let toppingsCache = {};
let tamaniosCache = {};
let combosCache = {};

// ─────────────────────────────────────────────────────────
//  INICIO / AUTENTICACIÓN
// ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    const { data: sesionData } = await sb.auth.getSession();
    if (!sesionData.session) {
        window.location.href = 'login.html';
        return;
    }

    const userEmailEl = document.getElementById('adm-user-email');
    if (userEmailEl) userEmailEl.textContent = sesionData.session.user.email;

    sb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') window.location.href = 'login.html';
    });

    document.getElementById('btn-logout')?.addEventListener('click', async () => {
        await sb.auth.signOut();
        window.location.href = 'login.html';
    });

    await cargarCategorias();
    await cargarProductos();
    await cargarToppings();
    await cargarTamanios();
    await cargarCombos();
    await cargarConfiguracion();

    inicializarEventosUI();
});

// ─────────────────────────────────────────────────────────
//  UTILIDADES
// ─────────────────────────────────────────────────────────

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function formatearPrecio(n) {
    return Number(n || 0).toLocaleString('es-CO');
}

function admToast(texto, tipo) {
    let toast = document.getElementById('adm-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'adm-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = texto;
    toast.className = 'adm-toast show ' + (tipo === 'error' ? 'adm-toast-error' : 'adm-toast-success');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('show'), 2800);
}

function admConfirmar(mensaje) {
    return window.confirm(mensaje);
}

function activarPestana(panelId) {
    document.querySelectorAll('.adm-side-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.adm-panel-section').forEach(s => s.classList.remove('active'));
    document.getElementById('btn-' + panelId)?.classList.add('active');
    document.getElementById(panelId)?.classList.add('active');
}

// ─────────────────────────────────────────────────────────
//  IMÁGENES (URL manual o subida a Supabase Storage)
// ─────────────────────────────────────────────────────────

function obtenerImagenFinal(modalId) {
    const modal = document.getElementById(modalId);
    const inputUrl = modal?.querySelector('.input-ruta-real');
    return inputUrl ? inputUrl.value.trim() : '';
}

function actualizarVistaPrevia(modal, url) {
    const img = modal.querySelector('.adm-img-preview-box img');
    if (img) img.src = (url && url.trim() !== '') ? url : FALLBACK_IMG;
}

function inicializarPestanasImagen(modal) {
    modal.querySelectorAll('.img-tab-btn').forEach(b => b.classList.remove('active'));
    modal.querySelectorAll('.img-tab-content').forEach(c => c.classList.remove('active'));
    const primerBtn = modal.querySelector('.img-tab-btn');
    if (primerBtn) {
        primerBtn.classList.add('active');
        document.getElementById(primerBtn.getAttribute('data-target'))?.classList.add('active');
    }
    const statusEl = modal.querySelector('.adm-upload-status');
    if (statusEl) statusEl.textContent = '';
}

async function subirImagenAStorage(file, subcarpeta) {
    const nombreLimpio = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const ruta = `${subcarpeta}/${Date.now()}_${nombreLimpio}`;
    const { error } = await sb.storage.from(BUCKET_NAME).upload(ruta, file, {
        cacheControl: '3600',
        upsert: false
    });
    if (error) throw error;
    const { data } = sb.storage.from(BUCKET_NAME).getPublicUrl(ruta);
    return data.publicUrl;
}

// ─────────────────────────────────────────────────────────
//  CATEGORÍAS
// ─────────────────────────────────────────────────────────

async function cargarCategorias() {
    const { data, error } = await sb.from('categorias').select('*').order('orden_mostrar', { ascending: true });
    if (error) { console.error(error); return; }
    categoriasCache = {};
    (data || []).forEach(c => { categoriasCache[c.id_categoria] = c; });
    renderizarTablaCategorias();
    renderizarSelectCategoriasEnProducto();
    renderizarFiltroCategoriasProductos();
}

function renderizarTablaCategorias() {
    const tbody = document.getElementById('tabla-categorias-body');
    if (!tbody) return;
    const filas = Object.values(categoriasCache).sort((a, b) => a.orden_mostrar - b.orden_mostrar);
    tbody.innerHTML = filas.map(cat => `
        <tr>
            <td><img src="${cat.imagen || FALLBACK_IMG}" class="adm-thumb" onerror="this.src='${FALLBACK_IMG}'"></td>
            <td><strong>${escapeHtml(cat.nombre)}</strong></td>
            <td>${cat.orden_mostrar}</td>
            <td>${cat.activo === 'S' ? '<span class="adm-badge active">Activo</span>' : '<span class="adm-badge inactive">Desactivado</span>'}</td>
            <td>
                <button type="button" class="adm-btn-primary btn-editar-cat" data-id="${cat.id_categoria}">✏️ Editar</button>
                <button type="button" class="adm-btn-danger btn-eliminar-cat" data-id="${cat.id_categoria}">🗑️</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="5" style="text-align:center; color:#888;">No hay categorías aún.</td></tr>';
}

function abrirModalNuevaCategoria() {
    const m = document.getElementById('modal-categoria');
    document.getElementById('lbl-cat-titulo').innerText = 'Nueva Categoría';
    document.getElementById('form-cat-id').value = '0';
    document.getElementById('form-cat-nombre').value = '';
    document.getElementById('form-cat-orden').value = '1';
    document.getElementById('form-cat-activo').value = 'S';
    document.getElementById('form-cat-toppings').value = 'S';
    document.getElementById('form-cat-img').value = '';
    m.classList.add('active');
    inicializarPestanasImagen(m);
    actualizarVistaPrevia(m, '');
}

function abrirModalEditarCategoria(id) {
    const cat = categoriasCache[id];
    if (!cat) return;
    const m = document.getElementById('modal-categoria');
    document.getElementById('lbl-cat-titulo').innerText = 'Editar Categoría';
    document.getElementById('form-cat-id').value = cat.id_categoria;
    document.getElementById('form-cat-nombre').value = cat.nombre;
    document.getElementById('form-cat-orden').value = cat.orden_mostrar;
    document.getElementById('form-cat-activo').value = cat.activo;
    document.getElementById('form-cat-toppings').value = cat.lleva_toppings;
    document.getElementById('form-cat-img').value = cat.imagen || '';
    m.classList.add('active');
    inicializarPestanasImagen(m);
    actualizarVistaPrevia(m, cat.imagen || '');
}

async function guardarCategoria() {
    const id = parseInt(document.getElementById('form-cat-id').value, 10);
    const nombre = document.getElementById('form-cat-nombre').value.trim();
    const orden = parseInt(document.getElementById('form-cat-orden').value, 10) || 0;
    const activo = document.getElementById('form-cat-activo').value;
    const lleva_toppings = document.getElementById('form-cat-toppings').value;
    const imagen = obtenerImagenFinal('modal-categoria');

    if (!nombre) { admToast('El nombre de la categoría es obligatorio.', 'error'); return; }

    const payload = { nombre, orden_mostrar: orden, activo, lleva_toppings, imagen: imagen || null };

    try {
        if (id > 0) {
            const { error } = await sb.from('categorias').update(payload).eq('id_categoria', id);
            if (error) throw error;
        } else {
            const { error } = await sb.from('categorias').insert(payload);
            if (error) throw error;
        }
        document.getElementById('modal-categoria').classList.remove('active');
        admToast('Categoría guardada correctamente 📁');
        await cargarCategorias();
        await cargarProductos();
    } catch (err) {
        console.error(err);
        admToast('Error al guardar: ' + err.message, 'error');
    }
}

async function eliminarCategoria(id) {
    if (!admConfirmar('¿Seguro que deseas eliminar esta categoría? Si tiene productos asociados, no se podrá borrar.')) return;
    try {
        const { error } = await sb.from('categorias').delete().eq('id_categoria', id);
        if (error) throw error;
        admToast('Categoría eliminada 🧼');
        await cargarCategorias();
    } catch (err) {
        console.error(err);
        admToast('No se pudo eliminar: probablemente tiene productos asociados.', 'error');
    }
}

// ─────────────────────────────────────────────────────────
//  PRODUCTOS
// ─────────────────────────────────────────────────────────

async function cargarProductos() {
    const { data, error } = await sb.from('productos').select('*').order('nombre', { ascending: true });
    if (error) { console.error(error); return; }
    productosCache = {};
    (data || []).forEach(p => { productosCache[p.id_producto] = p; });
    renderizarProductosPorCategoria();
}

function renderizarFiltroCategoriasProductos() {
    const sel = document.getElementById('filtro-prod-cat');
    if (!sel) return;
    const actual = sel.value;
    sel.innerHTML = '<option value="TODOS">--- Todas las Categorías ---</option>' +
        Object.values(categoriasCache).sort((a, b) => a.orden_mostrar - b.orden_mostrar)
            .map(c => `<option value="${c.id_categoria}">${escapeHtml(c.nombre)}</option>`).join('');
    if (actual) sel.value = actual;
}

function renderizarSelectCategoriasEnProducto() {
    const sel = document.getElementById('form-prod-cat');
    if (!sel) return;
    sel.innerHTML = Object.values(categoriasCache).sort((a, b) => a.nombre.localeCompare(b.nombre))
        .map(c => `<option value="${c.id_categoria}">${escapeHtml(c.nombre)}</option>`).join('');
}

function renderizarProductosPorCategoria() {
    const cont = document.getElementById('contenedor-productos-por-categoria');
    if (!cont) return;
    const categoriasOrdenadas = Object.values(categoriasCache).sort((a, b) => a.orden_mostrar - b.orden_mostrar);

    cont.innerHTML = categoriasOrdenadas.map(cat => {
        const productosDeCat = Object.values(productosCache)
            .filter(p => p.id_categoria === cat.id_categoria)
            .sort((a, b) => a.nombre.localeCompare(b.nombre));

        const filas = productosDeCat.map(prod => `
            <tr>
                <td><img src="${prod.imagen || FALLBACK_IMG}" class="adm-thumb" onerror="this.src='${FALLBACK_IMG}'"></td>
                <td><strong>${escapeHtml(prod.nombre)}</strong></td>
                <td>$${formatearPrecio(prod.precio)}</td>
                <td>${prod.activo === 'S' ? '<span class="adm-badge active">Activo</span>' : '<span class="adm-badge inactive">Oculto</span>'}</td>
                <td>
                    <button type="button" class="adm-btn-primary btn-editar-prod" data-id="${prod.id_producto}">✏️ Editar</button>
                    <button type="button" class="adm-btn-danger btn-eliminar-prod" data-id="${prod.id_producto}">🗑️</button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="5" style="text-align:center; color:#888;">Sin productos en esta categoría.</td></tr>';

        return `
            <div class="bloque-categoria-prod" data-cat-id="${cat.id_categoria}">
                <h4 class="adm-cat-title">📁 ${escapeHtml(cat.nombre)}</h4>
                <div class="adm-table-scroll">
                    <table class="adm-table-v2">
                        <thead><tr><th>Miniatura</th><th>Producto</th><th>Precio Base</th><th>Estado</th><th>Acciones</th></tr></thead>
                        <tbody>${filas}</tbody>
                    </table>
                </div>
            </div>
        `;
    }).join('') || '<p style="text-align:center; color:#888;">Crea primero una categoría.</p>';
}

function limpiarFilasTamanio() {
    const cont = document.getElementById('contenedor-tamanios-prod');
    if (cont) cont.innerHTML = '';
}

function crearFilaTamanio(idTamSel, precioVal) {
    const fila = document.createElement('div');
    fila.className = 'tamanio-row-dinamica';

    const opciones = Object.values(tamaniosCache)
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
        .map(t => `<option value="${t.id_tamanio}" ${String(t.id_tamanio) === String(idTamSel) ? 'selected' : ''}>${escapeHtml(t.nombre)}</option>`)
        .join('');

    fila.innerHTML = `
        <select class="adm-form-control select-tamanio-id">
            <option value="">-- Selecciona tamaño --</option>
            ${opciones}
        </select>
        <input type="number" class="adm-form-control input-precio-tamanio-din" placeholder="Precio ($)" value="${precioVal || ''}">
        <button type="button" class="btn-quitar-tamanio">✕</button>
    `;
    fila.querySelector('.btn-quitar-tamanio').addEventListener('click', () => fila.remove());
    return fila;
}

function agregarFilaTamanioVacia() {
    document.getElementById('contenedor-tamanios-prod')?.appendChild(crearFilaTamanio('', ''));
}

async function cargarTamaniosDeProducto(idProducto) {
    limpiarFilasTamanio();
    const { data } = await sb.from('producto_tamanios').select('id_tamanio, precio').eq('id_producto', idProducto);
    (data || []).forEach(t => {
        document.getElementById('contenedor-tamanios-prod').appendChild(crearFilaTamanio(t.id_tamanio, t.precio));
    });
}

function serializarTamanios() {
    const filas = document.querySelectorAll('#contenedor-tamanios-prod .tamanio-row-dinamica');
    const pares = [];
    filas.forEach(fila => {
        const idTam = fila.querySelector('.select-tamanio-id').value;
        const precio = fila.querySelector('.input-precio-tamanio-din').value;
        if (idTam && precio && Number(precio) > 0) {
            pares.push({ id_tamanio: parseInt(idTam, 10), precio: Number(precio) });
        }
    });
    return pares;
}

function renderizarToppingsEnProducto(idsSeleccionados) {
    const cont = document.getElementById('contenedor-toppings-prod');
    if (!cont) return;
    const activos = Object.values(toppingsCache).filter(t => t.activo === 'S').sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (activos.length === 0) {
        cont.innerHTML = '<p style="font-size:0.82rem; color:#888; margin:6px;">No hay toppings creados todavía. Ve a la pestaña Toppings.</p>';
        return;
    }
    cont.innerHTML = activos.map(t => `
        <label class="item-chk-prod">
            <input type="checkbox" class="chk-prod-topping" value="${t.id_topping}" ${idsSeleccionados.includes(t.id_topping) ? 'checked' : ''}>
            <span class="chk-prod-nombre">${escapeHtml(t.nombre)}</span>
            <span style="font-weight:bold; color:#D67280;">+$${formatearPrecio(t.precio_adicional)}</span>
        </label>
    `).join('');
}

async function cargarToppingsDeProducto(idProducto) {
    const { data } = await sb.from('producto_toppings').select('id_topping').eq('id_producto', idProducto);
    const ids = (data || []).map(t => t.id_topping);
    renderizarToppingsEnProducto(ids);
}

function abrirModalNuevoProducto() {
    const m = document.getElementById('modal-producto');
    document.getElementById('lbl-prod-titulo').innerText = 'Nuevo Producto';
    document.getElementById('form-prod-id').value = '0';
    document.getElementById('form-prod-nombre').value = '';
    document.getElementById('form-prod-precio').value = '';
    document.getElementById('form-prod-descripcion').value = '';
    document.getElementById('form-prod-activo').value = 'S';
    document.getElementById('form-prod-img').value = '';

    const requiereEl = document.getElementById('item-requiere-opciones');
    if (requiereEl) requiereEl.value = 'N';
    const listaEl = document.getElementById('item-lista-opciones');
    if (listaEl) listaEl.value = '';

    renderizarSelectCategoriasEnProducto();
    limpiarFilasTamanio();
    renderizarToppingsEnProducto([]);
    m.classList.add('active');
    inicializarPestanasImagen(m);
    actualizarVistaPrevia(m, '');
}

async function abrirModalEditarProducto(id) {
    const prod = productosCache[id];
    if (!prod) return;
    const m = document.getElementById('modal-producto');
    document.getElementById('lbl-prod-titulo').innerText = 'Editar Producto';
    document.getElementById('form-prod-id').value = prod.id_producto;
    document.getElementById('form-prod-nombre').value = prod.nombre;
    document.getElementById('form-prod-precio').value = prod.precio;
    document.getElementById('form-prod-descripcion').value = prod.descripcion || '';
    document.getElementById('form-prod-activo').value = prod.activo;
    document.getElementById('form-prod-img').value = prod.imagen || '';
    renderizarSelectCategoriasEnProducto();
    document.getElementById('form-prod-cat').value = prod.id_categoria;

    // Opciones dinámicas (requiere_opciones, lista_opciones)
    const requiereEl = document.getElementById('item-requiere-opciones');
    if (requiereEl) requiereEl.value = prod.requiere_opciones ? 'S' : 'N';
    const listaEl = document.getElementById('item-lista-opciones');
    if (listaEl) listaEl.value = prod.lista_opciones || '';

    m.classList.add('active');
    inicializarPestanasImagen(m);
    actualizarVistaPrevia(m, prod.imagen || '');

    await cargarTamaniosDeProducto(id);
    await cargarToppingsDeProducto(id);
}

async function guardarProducto() {
    const id = parseInt(document.getElementById('form-prod-id').value, 10);
    const nombre = document.getElementById('form-prod-nombre').value.trim();
    const precio = Number(document.getElementById('form-prod-precio').value) || 0;
    const categoria = parseInt(document.getElementById('form-prod-cat').value, 10);
    const activo = document.getElementById('form-prod-activo').value;
    const descripcion = document.getElementById('form-prod-descripcion').value.trim();
    const imagen = obtenerImagenFinal('modal-producto');

    const requiere_opciones = document.getElementById('item-requiere-opciones')?.value === 'S' ? true : false;
    const lista_opciones = document.getElementById('item-lista-opciones')?.value?.trim() || null;

    const tamanios = serializarTamanios();
    const toppingsSeleccionados = Array.from(document.querySelectorAll('.chk-prod-topping:checked')).map(c => parseInt(c.value, 10));


    if (!nombre) { admToast('El nombre del producto es obligatorio.', 'error'); return; }
    if (!categoria) { admToast('Selecciona una categoría.', 'error'); return; }

    const payload = { nombre, precio, id_categoria: categoria, activo, descripcion, imagen: imagen || null, requiere_opciones, lista_opciones };


    try {
        let idProducto = id;
        if (id > 0) {
            const { error } = await sb.from('productos').update(payload).eq('id_producto', id);
            if (error) throw error;
        } else {
            const { data, error } = await sb.from('productos').insert(payload).select().single();
            if (error) throw error;
            idProducto = data.id_producto;
        }

        await sb.from('producto_tamanios').delete().eq('id_producto', idProducto);
        if (tamanios.length > 0) {
            const { error } = await sb.from('producto_tamanios').insert(
                tamanios.map(t => ({ id_producto: idProducto, id_tamanio: t.id_tamanio, precio: t.precio }))
            );
            if (error) throw error;
        }

        await sb.from('producto_toppings').delete().eq('id_producto', idProducto);
        if (toppingsSeleccionados.length > 0) {
            const { error } = await sb.from('producto_toppings').insert(
                toppingsSeleccionados.map(idTop => ({ id_producto: idProducto, id_topping: idTop }))
            );
            if (error) throw error;
        }

        document.getElementById('modal-producto').classList.remove('active');
        admToast('Producto guardado correctamente 🍰');
        await cargarProductos();
    } catch (err) {
        console.error(err);
        admToast('Error al guardar: ' + err.message, 'error');
    }
}

async function eliminarProducto(id) {
    if (!admConfirmar('¿Seguro que deseas eliminar este producto?')) return;
    try {
        const { error } = await sb.from('productos').delete().eq('id_producto', id);
        if (error) throw error;
        admToast('Producto eliminado 🧼');
        await cargarProductos();
    } catch (err) {
        console.error(err);
        admToast('No se pudo eliminar el producto.', 'error');
    }
}

// ─────────────────────────────────────────────────────────
//  TOPPINGS
// ─────────────────────────────────────────────────────────

async function cargarToppings() {
    const { data, error } = await sb.from('toppings').select('*').order('nombre', { ascending: true });
    if (error) { console.error(error); return; }
    toppingsCache = {};
    (data || []).forEach(t => { toppingsCache[t.id_topping] = t; });
    renderizarTablaToppings();
}

function renderizarTablaToppings() {
    const tbody = document.getElementById('tabla-toppings-body');
    if (!tbody) return;
    const filas = Object.values(toppingsCache).sort((a, b) => a.nombre.localeCompare(b.nombre));
    tbody.innerHTML = filas.map(t => `
        <tr>
            <td><strong>${escapeHtml(t.nombre)}</strong></td>
            <td>$${formatearPrecio(t.precio_adicional)}</td>
            <td>${t.activo === 'S' ? '<span class="adm-badge active">Activo</span>' : '<span class="adm-badge inactive">Desactivado</span>'}</td>
            <td>
                <button type="button" class="adm-btn-primary btn-editar-topping" data-id="${t.id_topping}">✏️ Editar</button>
                <button type="button" class="adm-btn-danger btn-eliminar-topping" data-id="${t.id_topping}">🗑️</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="4" style="text-align:center; color:#888;">No hay toppings aún.</td></tr>';
}

function abrirModalNuevoTopping() {
    document.getElementById('lbl-topping-titulo').innerText = 'Nuevo Topping';
    document.getElementById('form-topping-id').value = '0';
    document.getElementById('form-topping-nombre').value = '';
    document.getElementById('form-topping-precio').value = '';
    document.getElementById('form-topping-activo').value = 'S';
    document.getElementById('modal-topping').classList.add('active');
}

function abrirModalEditarTopping(id) {
    const t = toppingsCache[id];
    if (!t) return;
    document.getElementById('lbl-topping-titulo').innerText = 'Editar Topping';
    document.getElementById('form-topping-id').value = t.id_topping;
    document.getElementById('form-topping-nombre').value = t.nombre;
    document.getElementById('form-topping-precio').value = t.precio_adicional;
    document.getElementById('form-topping-activo').value = t.activo;
    document.getElementById('modal-topping').classList.add('active');
}

async function guardarTopping() {
    const id = parseInt(document.getElementById('form-topping-id').value, 10);
    const nombre = document.getElementById('form-topping-nombre').value.trim();
    const precio = Number(document.getElementById('form-topping-precio').value) || 0;
    const activo = document.getElementById('form-topping-activo').value;

    if (!nombre) { admToast('El nombre del topping es obligatorio.', 'error'); return; }

    const payload = { nombre, precio_adicional: precio, activo };

    try {
        if (id > 0) {
            const { error } = await sb.from('toppings').update(payload).eq('id_topping', id);
            if (error) throw error;
        } else {
            const { error } = await sb.from('toppings').insert(payload);
            if (error) throw error;
        }
        document.getElementById('modal-topping').classList.remove('active');
        admToast('Topping guardado correctamente 🍫');
        await cargarToppings();
    } catch (err) {
        console.error(err);
        admToast('Error al guardar: ' + err.message, 'error');
    }
}

async function eliminarTopping(id) {
    if (!admConfirmar('¿Seguro que deseas eliminar este topping?')) return;
    try {
        const { error } = await sb.from('toppings').delete().eq('id_topping', id);
        if (error) throw error;
        admToast('Topping eliminado 🧼');
        await cargarToppings();
    } catch (err) {
        console.error(err);
        admToast('No se pudo eliminar el topping.', 'error');
    }
}

// ─────────────────────────────────────────────────────────
//  TAMAÑOS
// ─────────────────────────────────────────────────────────

async function cargarTamanios() {
    const { data, error } = await sb.from('tamanios').select('*').order('nombre', { ascending: true });
    if (error) { console.error(error); return; }
    tamaniosCache = {};
    (data || []).forEach(t => { tamaniosCache[t.id_tamanio] = t; });
    renderizarTablaTamanios();
}

function renderizarTablaTamanios() {
    const tbody = document.getElementById('tabla-tamanios-body');
    if (!tbody) return;
    const filas = Object.values(tamaniosCache).sort((a, b) => a.nombre.localeCompare(b.nombre));
    tbody.innerHTML = filas.map(t => `
        <tr>
            <td><strong>${escapeHtml(t.nombre)}</strong></td>
            <td>
                <button type="button" class="adm-btn-primary btn-editar-tamanio" data-id="${t.id_tamanio}">✏️ Editar</button>
                <button type="button" class="adm-btn-danger btn-eliminar-tamanio" data-id="${t.id_tamanio}">🗑️</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="2" style="text-align:center; color:#888;">No hay tamaños aún.</td></tr>';
}

function abrirModalNuevoTamanio() {
    document.getElementById('lbl-tamanio-titulo').innerText = 'Nuevo Tamaño';
    document.getElementById('form-tamanio-id').value = '0';
    document.getElementById('form-tamanio-nombre').value = '';
    document.getElementById('modal-tamanio').classList.add('active');
}

function abrirModalEditarTamanio(id) {
    const t = tamaniosCache[id];
    if (!t) return;
    document.getElementById('lbl-tamanio-titulo').innerText = 'Editar Tamaño';
    document.getElementById('form-tamanio-id').value = t.id_tamanio;
    document.getElementById('form-tamanio-nombre').value = t.nombre;
    document.getElementById('modal-tamanio').classList.add('active');
}

async function guardarTamanio() {
    const id = parseInt(document.getElementById('form-tamanio-id').value, 10);
    const nombre = document.getElementById('form-tamanio-nombre').value.trim();
    if (!nombre) { admToast('El nombre del tamaño es obligatorio.', 'error'); return; }

    try {
        if (id > 0) {
            const { error } = await sb.from('tamanios').update({ nombre }).eq('id_tamanio', id);
            if (error) throw error;
        } else {
            const { error } = await sb.from('tamanios').insert({ nombre });
            if (error) throw error;
        }
        document.getElementById('modal-tamanio').classList.remove('active');
        admToast('Tamaño guardado correctamente 📏');
        await cargarTamanios();
    } catch (err) {
        console.error(err);
        admToast('Error al guardar: ' + err.message, 'error');
    }
}

async function eliminarTamanio(id) {
    if (!admConfirmar('¿Seguro que deseas eliminar este tamaño? Esto fallará si algún producto lo está usando.')) return;
    try {
        const { error } = await sb.from('tamanios').delete().eq('id_tamanio', id);
        if (error) throw error;
        admToast('Tamaño eliminado 🧼');
        await cargarTamanios();
    } catch (err) {
        console.error(err);
        admToast('No se pudo eliminar: probablemente está en uso por algún producto.', 'error');
    }
}

// ─────────────────────────────────────────────────────────
//  COMBOS
// ─────────────────────────────────────────────────────────

async function cargarCombos() {
    const { data, error } = await sb.from('combos').select('*').order('id_combo', { ascending: true });
    if (error) { console.error(error); return; }
    combosCache = {};
    (data || []).forEach(c => { combosCache[c.id_combo] = c; });
    renderizarTablaCombos();
}

function renderizarTablaCombos() {
    const tbody = document.getElementById('tabla-combos-body');
    if (!tbody) return;
    const filas = Object.values(combosCache).sort((a, b) => a.id_combo - b.id_combo);
    tbody.innerHTML = filas.map(c => `
        <tr>
            <td><img src="${c.imagen || FALLBACK_IMG}" class="adm-thumb" onerror="this.src='${FALLBACK_IMG}'"></td>
            <td><strong>#${c.id_combo}</strong></td>
            <td>${escapeHtml(c.nombre)}</td>
            <td>$${formatearPrecio(c.precio_normal)}</td>
            <td><strong style="color:#27ae60;">$${formatearPrecio(c.precio_descuento)}</strong></td>
            <td>${c.activo === 'S' ? '<span class="adm-badge active">Activo</span>' : '<span class="adm-badge inactive">Oculto</span>'}</td>
            <td>
                <button type="button" class="adm-btn-primary btn-editar-combo" data-id="${c.id_combo}">✏️ Editar</button>
                <button type="button" class="adm-btn-danger btn-eliminar-combo" data-id="${c.id_combo}">🗑️</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="7" style="text-align:center; color:#888;">No hay combos aún.</td></tr>';
}

function renderizarListaProductosCombo(idsSeleccionados) {
    const cont = document.getElementById('combo-productos-lista');
    if (!cont) return;
    const categoriasOrdenadas = Object.values(categoriasCache).sort((a, b) => a.orden_mostrar - b.orden_mostrar);

    let html = '';
    categoriasOrdenadas.forEach(cat => {
        const productosDeCat = Object.values(productosCache)
            .filter(p => p.id_categoria === cat.id_categoria && p.activo === 'S')
            .sort((a, b) => a.nombre.localeCompare(b.nombre));
        if (productosDeCat.length === 0) return;

        html += `<div class="combo-cat-grupo">${escapeHtml(cat.nombre).toUpperCase()}</div>`;
        productosDeCat.forEach(p => {
            html += `
                <label class="item-chk-prod">
                    <input type="checkbox" class="chk-combo-producto" value="${p.id_producto}" data-precio="${p.precio}" ${idsSeleccionados.includes(p.id_producto) ? 'checked' : ''}>
                    <span class="chk-prod-nombre">${escapeHtml(p.nombre)}</span>
                    <span style="font-weight:bold; color:#27ae60;">$${formatearPrecio(p.precio)}</span>
                </label>`;
        });
    });

    cont.innerHTML = html || '<p style="font-size:0.82rem; color:#888; margin:6px;">No hay productos activos todavía.</p>';
}

function recalcularPrecioNormalCombo() {
    let total = 0;
    document.querySelectorAll('.chk-combo-producto:checked').forEach(chk => {
        total += parseFloat(chk.getAttribute('data-precio') || 0);
    });
    document.getElementById('form-combo-normal').value = total;
}

function abrirModalNuevoCombo() {
    const m = document.getElementById('modal-combo');
    document.getElementById('lbl-combo-titulo').innerText = 'Crear Nuevo Combo';
    document.getElementById('form-combo-id').value = '0';
    document.getElementById('form-combo-nombre').value = '';
    document.getElementById('form-combo-normal').value = '';
    document.getElementById('form-combo-descuento').value = '';
    document.getElementById('form-combo-desc').value = '';
    document.getElementById('form-combo-activo').value = 'S';
    document.getElementById('form-combo-img').value = '';
    document.getElementById('buscar-prod-combo').value = '';

    const requiereEl = document.getElementById('item-requiere-opciones');
    if (requiereEl) requiereEl.value = 'N';
    const listaEl = document.getElementById('item-lista-opciones');
    if (listaEl) listaEl.value = '';

    renderizarListaProductosCombo([]);
    m.classList.add('active');
    inicializarPestanasImagen(m);
    actualizarVistaPrevia(m, '');
}


async function abrirModalEditarCombo(id) {
    const combo = combosCache[id];
    if (!combo) return;
    const m = document.getElementById('modal-combo');
    document.getElementById('lbl-combo-titulo').innerText = 'Editar Combo';
    document.getElementById('form-combo-id').value = combo.id_combo;
    document.getElementById('form-combo-nombre').value = combo.nombre;
    document.getElementById('form-combo-normal').value = combo.precio_normal;
    document.getElementById('form-combo-descuento').value = combo.precio_descuento;
    document.getElementById('form-combo-desc').value = combo.descripcion || '';
    document.getElementById('form-combo-activo').value = combo.activo;
    document.getElementById('form-combo-img').value = combo.imagen || '';
    document.getElementById('buscar-prod-combo').value = '';

    // Opciones dinámicas (requiere_opciones, lista_opciones)
    const requiereEl = document.getElementById('item-requiere-opciones');
    if (requiereEl) requiereEl.value = combo.requiere_opciones ? 'S' : 'N';
    const listaEl = document.getElementById('item-lista-opciones');
    if (listaEl) listaEl.value = combo.lista_opciones || '';

    const { data: relaciones } = await sb.from('combo_productos').select('id_producto').eq('id_combo', id);
    const idsSeleccionados = (relaciones || []).map(r => r.id_producto);
    renderizarListaProductosCombo(idsSeleccionados);

    m.classList.add('active');
    inicializarPestanasImagen(m);
    actualizarVistaPrevia(m, combo.imagen || '');
}


async function guardarCombo() {
    const id = parseInt(document.getElementById('form-combo-id').value, 10);
    const nombre = document.getElementById('form-combo-nombre').value.trim();
    const normal = Number(document.getElementById('form-combo-normal').value) || 0;
    const descuento = Number(document.getElementById('form-combo-descuento').value) || 0;
    const descripcion = document.getElementById('form-combo-desc').value.trim();
    const activo = document.getElementById('form-combo-activo').value;

    // Importante: el value real de la URL pública debe estar en el input .input-ruta-real
    // (la subida ocurre en el listener global de change). Si el usuario subió archivo, ahí quedará la URL.
    const imagen = obtenerImagenFinal('modal-combo');

    const requiere_opciones = document.getElementById('item-requiere-opciones')?.value === 'S' ? true : false;
    const lista_opciones = document.getElementById('item-lista-opciones')?.value?.trim() || null;

    // Nuevo: cantidad exacta de selecciones que debe hacer el cliente
    const cantidad_opciones_el = document.getElementById('combo-cantidad-opciones');
    const cantidad_opciones = cantidad_opciones_el ? Math.max(1, parseInt(cantidad_opciones_el.value, 10) || 1) : 1;

    const productosSeleccionados = Array.from(document.querySelectorAll('.chk-combo-producto:checked')).map(c => parseInt(c.value, 10));

    if (!nombre) { admToast('El nombre del combo es obligatorio.', 'error'); return; }
    if (productosSeleccionados.length === 0) { admToast('Selecciona al menos un producto para el combo.', 'error'); return; }

    const payload = {
        nombre,
        precio_normal: normal,
        precio_descuento: descuento,
        descripcion,
        activo,
        imagen: imagen || null,
        requiere_opciones,
        lista_opciones,
        cantidad_opciones
    };

    try {
        let idCombo = id;
        if (id > 0) {
            const { error } = await sb.from('combos').update(payload).eq('id_combo', id);
            if (error) throw error;
        } else {
            const { data, error } = await sb.from('combos').insert(payload).select().single();
            if (error) throw error;
            idCombo = data.id_combo;
        }

        await sb.from('combo_productos').delete().eq('id_combo', idCombo);
        const { error: errRel } = await sb.from('combo_productos').insert(
            productosSeleccionados.map(idProd => ({ id_combo: idCombo, id_producto: idProd }))
        );
        if (errRel) throw errRel;

        document.getElementById('modal-combo').classList.remove('active');
        admToast('Combo guardado correctamente 🎁');
        await cargarCombos();
    } catch (err) {
        console.error(err);
        admToast('Error al guardar: ' + err.message, 'error');
    }
}

async function eliminarCombo(id) {
    if (!admConfirmar('¿Seguro que deseas eliminar este combo?')) return;
    try {
        const { error } = await sb.from('combos').delete().eq('id_combo', id);
        if (error) throw error;
        admToast('Combo eliminado 🧼');
        await cargarCombos();
    } catch (err) {
        console.error(err);
        admToast('No se pudo eliminar el combo.', 'error');
    }
}

// ─────────────────────────────────────────────────────────
//  CONFIGURACIÓN
// ─────────────────────────────────────────────────────────

async function cargarConfiguracion() {
    const { data, error } = await sb.from('lc_configuracion').select('whatsapp_recepcion').eq('id_config_tienda', 1).single();
    if (error) { console.error(error); return; }
    const input = document.getElementById('cfg-wpp');
    if (input) input.value = (data && data.whatsapp_recepcion) || '';
}

async function guardarConfiguracion() {
    const wpp = document.getElementById('cfg-wpp').value.trim();
    try {
        const { error } = await sb.from('lc_configuracion').update({ whatsapp_recepcion: wpp }).eq('id_config_tienda', 1);
        if (error) throw error;
        admToast('Configuración guardada ⚙️');
    } catch (err) {
        console.error(err);
        admToast('Error al guardar la configuración.', 'error');
    }
}

// ─────────────────────────────────────────────────────────
//  EVENTOS GLOBALES (delegación)
// ─────────────────────────────────────────────────────────

function inicializarEventosUI() {

    document.getElementById('filtro-prod-cat')?.addEventListener('change', function () {
        const val = this.value;
        document.querySelectorAll('.bloque-categoria-prod').forEach(b => {
            b.style.display = (val === 'TODOS' || b.getAttribute('data-cat-id') === val) ? '' : 'none';
        });
    });

    document.getElementById('buscar-prod-combo')?.addEventListener('input', function () {
        const filtro = this.value.toLowerCase().trim();
        document.querySelectorAll('#combo-productos-lista .item-chk-prod').forEach(item => {
            const nombre = item.querySelector('.chk-prod-nombre').innerText.toLowerCase();
            item.style.display = nombre.includes(filtro) ? 'flex' : 'none';
        });
        document.querySelectorAll('#combo-productos-lista .combo-cat-grupo').forEach(grupo => {
            let sig = grupo.nextElementSibling;
            let hayVisible = false;
            while (sig && !sig.classList.contains('combo-cat-grupo')) {
                if (sig.style.display !== 'none') hayVisible = true;
                sig = sig.nextElementSibling;
            }
            grupo.style.display = hayVisible ? '' : 'none';
        });
    });

    document.addEventListener('click', function (e) {

        const btnTab = e.target.closest('.adm-side-btn');
        if (btnTab) { activarPestana(btnTab.id.replace('btn-', '')); return; }

        const btnImgTab = e.target.closest('.img-tab-btn');
        if (btnImgTab) {
            const grupo = btnImgTab.closest('.adm-form-group');
            grupo.querySelectorAll('.img-tab-btn').forEach(b => b.classList.remove('active'));
            grupo.querySelectorAll('.img-tab-content').forEach(c => c.classList.remove('active'));
            btnImgTab.classList.add('active');
            document.getElementById(btnImgTab.getAttribute('data-target'))?.classList.add('active');
            return;
        }

        if (e.target.id === 'btn-nueva-cat') { abrirModalNuevaCategoria(); return; }
        if (e.target.id === 'btn-nuevo-prod') { abrirModalNuevoProducto(); return; }
        if (e.target.id === 'btn-nuevo-combo') { abrirModalNuevoCombo(); return; }
        if (e.target.id === 'btn-nuevo-topping') { abrirModalNuevoTopping(); return; }
        if (e.target.id === 'btn-nuevo-tamanio') { abrirModalNuevoTamanio(); return; }
        if (e.target.id === 'btn-agregar-tamanio') { agregarFilaTamanioVacia(); return; }

        const btnEditCat = e.target.closest('.btn-editar-cat');
        if (btnEditCat) { abrirModalEditarCategoria(parseInt(btnEditCat.dataset.id, 10)); return; }

        const btnDelCat = e.target.closest('.btn-eliminar-cat');
        if (btnDelCat) { eliminarCategoria(parseInt(btnDelCat.dataset.id, 10)); return; }

        const btnEditProd = e.target.closest('.btn-editar-prod');
        if (btnEditProd) { abrirModalEditarProducto(parseInt(btnEditProd.dataset.id, 10)); return; }

        const btnDelProd = e.target.closest('.btn-eliminar-prod');
        if (btnDelProd) { eliminarProducto(parseInt(btnDelProd.dataset.id, 10)); return; }

        const btnEditCombo = e.target.closest('.btn-editar-combo');
        if (btnEditCombo) { abrirModalEditarCombo(parseInt(btnEditCombo.dataset.id, 10)); return; }

        const btnDelCombo = e.target.closest('.btn-eliminar-combo');
        if (btnDelCombo) { eliminarCombo(parseInt(btnDelCombo.dataset.id, 10)); return; }

        const btnEditTop = e.target.closest('.btn-editar-topping');
        if (btnEditTop) { abrirModalEditarTopping(parseInt(btnEditTop.dataset.id, 10)); return; }

        const btnDelTop = e.target.closest('.btn-eliminar-topping');
        if (btnDelTop) { eliminarTopping(parseInt(btnDelTop.dataset.id, 10)); return; }

        const btnEditTam = e.target.closest('.btn-editar-tamanio');
        if (btnEditTam) { abrirModalEditarTamanio(parseInt(btnEditTam.dataset.id, 10)); return; }

        const btnDelTam = e.target.closest('.btn-eliminar-tamanio');
        if (btnDelTam) { eliminarTamanio(parseInt(btnDelTam.dataset.id, 10)); return; }

        const btnCerrar = e.target.closest('.data-cerrar');
        if (btnCerrar) { document.getElementById(btnCerrar.dataset.modal)?.classList.remove('active'); return; }

        if (e.target.id === 'btn-guardar-cat') { guardarCategoria(); return; }
        if (e.target.id === 'btn-guardar-prod') { guardarProducto(); return; }
        if (e.target.id === 'btn-guardar-combo') { guardarCombo(); return; }
        if (e.target.id === 'btn-guardar-topping') { guardarTopping(); return; }
        if (e.target.id === 'btn-guardar-tamanio') { guardarTamanio(); return; }
        if (e.target.id === 'btn-guardar-cfg') { guardarConfiguracion(); return; }
    });

    document.addEventListener('input', function (e) {
        const inputUrl = e.target.closest('.input-ruta-real');
        if (inputUrl) {
            const modal = inputUrl.closest('.adm-modal-v2');
            if (modal) actualizarVistaPrevia(modal, inputUrl.value.trim());
        }
    });

    document.addEventListener('change', async function (e) {
        const fileInput = e.target.closest('.adm-file-input-nativa');
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            const modal = fileInput.closest('.adm-modal-v2');
            const subcarpeta = modal.getAttribute('data-carpeta-storage') || 'Otros';
            const file = fileInput.files[0];
            const inputUrl = modal.querySelector('.input-ruta-real');
            const statusEl = modal.querySelector('.adm-upload-status');

            if (statusEl) statusEl.textContent = 'Subiendo imagen...';

            try {
                const url = await subirImagenAStorage(file, subcarpeta);
                if (inputUrl) inputUrl.value = url;
                actualizarVistaPrevia(modal, url);
                if (statusEl) statusEl.textContent = '✅ Imagen subida correctamente.';
            } catch (err) {
                console.error(err);
                if (statusEl) statusEl.textContent = '❌ Error al subir la imagen.';
                admToast('No se pudo subir la imagen: ' + err.message, 'error');
            }
            return;
        }

        if (e.target.classList.contains('chk-combo-producto')) {
            recalcularPrecioNormalCombo();
        }
    });
}
