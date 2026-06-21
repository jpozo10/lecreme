// ============================================================
//  LE CRÈME — app.js
//  Migrado de Oracle APEX a Supabase. Usa el cliente global `sb`
//  definido en config.js.
// ============================================================

let idProductoSeleccionado = 0;
const productosCache = {};   // id_producto -> fila de productos
const categoriasConfig = {}; // id_categoria -> fila de categorias (para saber lleva_toppings)
const combosCache = {};      // id_combo -> fila de combos

const LOGO_URL = 'https://yimihpnzkpvqizojpewk.supabase.co/storage/v1/object/public/Menu/Favicon/IMAGEN%20LECREME.jpg'; 
document.addEventListener('DOMContentLoaded', function () {
    renderizarPagina();
    renderizarCombos();
    actualizarContadorYDatosCarrito();
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

function obtenerSessionId() {
    let id = localStorage.getItem('lc_session_id');
    if (!id) {
        id = (window.crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2);
        localStorage.setItem('lc_session_id', id);
    }
    return id;
}

function mostrarMensajeExito(texto) {
    let toast = document.getElementById('lc-toast-success');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'lc-toast-success';
        toast.className = 'lc-toast-success';
        document.body.appendChild(toast);
    }
    toast.textContent = texto;
    toast.classList.add('show');
    clearTimeout(toast._timeoutId);
    toast._timeoutId = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ─────────────────────────────────────────────────────────
//  RENDERIZADO DE LA PÁGINA (categorías + productos)
// ─────────────────────────────────────────────────────────

async function renderizarPagina() {
    const listaCategorias = document.getElementById('lc-categories-list');
    const seccionesProductos = document.getElementById('lc-products-sections');

    try {
        const { data: categorias, error } = await sb
            .from('categorias')
            .select('*')
            .eq('activo', 'S')
            .order('orden_mostrar', { ascending: true })
            .order('id_categoria', { ascending: true });

        if (error) throw error;

        listaCategorias.innerHTML = '';
        seccionesProductos.innerHTML = '';

        if (!categorias || categorias.length === 0) {
            listaCategorias.innerHTML = '<p style="padding:10px; color:#888;">No hay categorías activas todavía.</p>';
            return;
        }

        categorias.forEach(cat => {
            categoriasConfig[cat.id_categoria] = cat;
            listaCategorias.appendChild(crearCategoriaItem(cat));
        });

        for (const cat of categorias) {
            const wrapper = document.createElement('div');
            wrapper.id = 'sec-' + cat.id_categoria;
            wrapper.className = 'lc-products-wrapper';

            const titulo = document.createElement('h3');
            titulo.className = 'lc-title';
            titulo.textContent = cat.nombre;
            wrapper.appendChild(titulo);

            const grid = document.createElement('div');
            grid.className = 'lc-products-grid';
            wrapper.appendChild(grid);

            seccionesProductos.appendChild(wrapper);

            const { data: productos, error: errProd } = await sb
                .from('productos')
                .select('*')
                .eq('id_categoria', cat.id_categoria)
                .eq('activo', 'S')
                .order('nombre', { ascending: true });

            if (errProd) { console.error('Error cargando productos:', errProd); continue; }

            (productos || []).forEach(prod => {
                productosCache[prod.id_producto] = prod;
                grid.appendChild(crearProductoCard(prod));
            });
        }
    } catch (err) {
        console.error('Error cargando la página:', err);
        listaCategorias.innerHTML = '<p style="padding:10px; color:#c0392b;">No se pudo conectar con la base de datos. Revisa config.js.</p>';
    }
}

function crearCategoriaItem(cat) {
    const a = document.createElement('a');
    a.href = 'javascript:void(0);';
    a.className = 'lc-category-item';
    a.style.textDecoration = 'none';
    a.onclick = function () { irACategoria(cat.id_categoria); return false; };

    const img = document.createElement('img');
    img.src = cat.imagen || LOGO_URL;
    img.className = 'lc-category-img';
    img.onerror = function () { img.src = LOGO_URL; };

    const nombre = document.createElement('div');
    nombre.className = 'lc-category-name';
    nombre.textContent = cat.nombre;

    a.appendChild(img);
    a.appendChild(nombre);
    return a;
}

function crearProductoCard(prod) {
    const div = document.createElement('div');
    div.className = 'lc-product-item';

    const descHtml = prod.descripcion
        ? `<p class="lc-product-desc">${escapeHtml(prod.descripcion)}</p>`
        : '';

    div.innerHTML = `
        <img src="${prod.imagen || LOGO_URL}" class="lc-product-img" onerror="this.src='${LOGO_URL}'">
        <h4>${escapeHtml(prod.nombre)}</h4>
        ${descHtml}
        <p class="lc-product-price">$${formatearPrecio(prod.precio)}</p>
        <button type="button" class="lc-btn-add">Agregar</button>
    `;

    div.querySelector('.lc-btn-add').onclick = function () { abrirModal(prod.id_producto); };
    return div;
}

// ─────────────────────────────────────────────────────────
//  COMBOS
// ─────────────────────────────────────────────────────────

async function renderizarCombos() {
    const wrapper = document.getElementById('lc-combos-wrapper');
    const grid = document.getElementById('lc-combos-grid');
    if (!wrapper || !grid) return;

    try {
        const { data: combos, error } = await sb
            .from('combos')
            .select('*')
            .eq('activo', 'S')
            .order('id_combo', { ascending: true });

        if (error) throw error;

        if (!combos || combos.length === 0) {
            wrapper.style.display = 'none';
            return;
        }

        grid.innerHTML = '';
        combos.forEach(combo => {
            combosCache[combo.id_combo] = combo;
            grid.appendChild(crearComboCard(combo));
        });
        wrapper.style.display = 'block';
    } catch (err) {
        console.error('Error cargando combos:', err);
        wrapper.style.display = 'none';
    }
}

function crearComboCard(combo) {
    const div = document.createElement('div');
    div.className = 'lc-product-item';

    const descHtml = combo.descripcion
        ? `<p class="lc-product-desc">${escapeHtml(combo.descripcion)}</p>`
        : '';

    const hayDescuento = Number(combo.precio_normal) > Number(combo.precio_descuento);
    const precioHtml = hayDescuento
        ? `<span class="lc-combo-price-old">$${formatearPrecio(combo.precio_normal)}</span><span class="lc-combo-price-new">$${formatearPrecio(combo.precio_descuento)}</span>`
        : `<span class="lc-combo-price-new">$${formatearPrecio(combo.precio_descuento)}</span>`;

    div.innerHTML = `
        <img src="${combo.imagen || LOGO_URL}" class="lc-product-img" onerror="this.src='${LOGO_URL}'">
        <h4>${escapeHtml(combo.nombre)}</h4>
        ${descHtml}
        <p class="lc-product-price">${precioHtml}</p>
        <button type="button" class="lc-btn-add">Agregar Combo</button>
    `;

    div.querySelector('.lc-btn-add').onclick = function () { agregarComboAlCarrito(combo.id_combo); };
    return div;
}

async function agregarComboAlCarrito(idCombo) {
    const combo = combosCache[idCombo];
    if (!combo) return;
    const sessionId = obtenerSessionId();

    try {
        const { data: existentes, error: errSel } = await sb
            .from('carrito_items')
            .select('id, cantidad')
            .eq('session_id', sessionId)
            .eq('id_combo', idCombo);
        if (errSel) throw errSel;

        if (existentes && existentes.length > 0) {
            const item = existentes[0];
            const { error } = await sb.from('carrito_items').update({ cantidad: item.cantidad + 1 }).eq('id', item.id);
            if (error) throw error;
        } else {
            const { error } = await sb.from('carrito_items').insert({
                session_id: sessionId,
                id_producto: null,
                id_combo: idCombo,
                id_tamanio: null,
                cantidad: 1,
                precio_unitario: Number(combo.precio_descuento)
            });
            if (error) throw error;
        }

        mostrarMensajeExito('¡Combo agregado al carrito!');
        actualizarContadorYDatosCarrito();
    } catch (err) {
        console.error('Error al agregar el combo:', err);
        alert('Hubo un error al agregar el combo al carrito.');
    }
}

// ─────────────────────────────────────────────────────────
//  NAVEGACIÓN DE CATEGORÍAS (BANNER)
// ─────────────────────────────────────────────────────────

function irACategoria(idCategoria) {
    var target = document.getElementById('sec-' + idCategoria);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        setTimeout(function () {
            var retryTarget = document.getElementById('sec-' + idCategoria);
            if (retryTarget) {
                retryTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                console.warn('Sección no encontrada: sec-' + idCategoria);
            }
        }, 300);
    }
}

// ─────────────────────────────────────────────────────────
//  MODAL DE PRODUCTO
// ─────────────────────────────────────────────────────────

function evaluarVisibilidadToppings() {
    const toppingsBlock = document.getElementById('lc-toppings-wrapper-block');
    const containerToppings = document.getElementById('modal-toppings-container');
    const modalTitle = document.getElementById('modal-product-name');

    if (!toppingsBlock || !modalTitle) return;

    const llevaToppings = modalTitle.getAttribute('data-lleva-toppings') || 'N';

    if (llevaToppings === 'S') {
        toppingsBlock.style.display = 'block';
    } else {
        toppingsBlock.style.display = 'none';
        if (containerToppings) {
            containerToppings.querySelectorAll('input[type="checkbox"]').forEach(chk => chk.checked = false);
        }
    }

    calcularTotal();
}

async function abrirModal(idProducto) {
    idProductoSeleccionado = idProducto;
    const prod = productosCache[idProducto];
    if (!prod) { console.error('Producto no encontrado en caché:', idProducto); return; }

    const cat = categoriasConfig[prod.id_categoria];
    const llevaToppings = cat ? cat.lleva_toppings : 'N';

    const modalTitle = document.getElementById('modal-product-name');
    if (modalTitle) {
        modalTitle.innerText = prod.nombre;
        modalTitle.setAttribute('data-lleva-toppings', llevaToppings || 'N');
    }

    const modalImg = document.getElementById('modal-product-img');
    if (modalImg) modalImg.src = prod.imagen || LOGO_URL;

    const descElement = document.getElementById('modal-product-description');
    if (descElement) descElement.innerText = prod.descripcion ? prod.descripcion : '';

    const toppingsBlock = document.getElementById('lc-toppings-wrapper-block');
    if (toppingsBlock) {
        toppingsBlock.style.display = (llevaToppings === 'S') ? 'block' : 'none';
    }

    try {
        // --- Tamaños del producto (ordenados de más barato a más caro) ---
        const { data: tamanios, error: errTam } = await sb
            .from('producto_tamanios')
            .select('id_tamanio, precio, tamanios(nombre)')
            .eq('id_producto', idProducto)
            .order('precio', { ascending: true });
        if (errTam) throw errTam;

        const selectTam = document.getElementById('lc-product-tamanio');
        if (selectTam) {
            selectTam.innerHTML = '';
            if (tamanios && tamanios.length > 0) {
                tamanios.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.id_tamanio;
                    opt.setAttribute('data-precio', t.precio);
                    const nombreTam = t.tamanios ? t.tamanios.nombre : 'Tamaño';
                    opt.innerText = `${nombreTam} ($${formatearPrecio(t.precio)})`;
                    selectTam.appendChild(opt);
                });
            } else {
                const opt = document.createElement('option');
                opt.value = '';
                opt.setAttribute('data-precio', prod.precio);
                opt.innerText = `Normal ($${formatearPrecio(prod.precio)})`;
                selectTam.appendChild(opt);
            }
            selectTam.onchange = function () {
                evaluarVisibilidadToppings();
                calcularTotal();
            };
        }

        // --- Toppings del producto ---
        const { data: toppings, error: errTop } = await sb
            .from('producto_toppings')
            .select('id_topping, toppings(nombre, precio_adicional, activo)')
            .eq('id_producto', idProducto);
        if (errTop) throw errTop;

        const containerToppings = document.getElementById('modal-toppings-container');
        if (containerToppings) {
            containerToppings.innerHTML = '';
            const activos = (toppings || []).filter(t => t.toppings && t.toppings.activo === 'S');

            if (activos.length > 0) {
                activos.forEach(t => {
                    containerToppings.innerHTML += `
                        <div class="lc-topping-item" onclick="alternarCheckbox(${t.id_topping})"
                            style="display:flex; justify-content:space-between; align-items:center; padding:10px; margin-bottom:6px; background:#fff; border:1px solid #f1f5f9; border-radius:8px; cursor:pointer;">
                            <div style="display:flex; align-items:center;">
                                <input type="checkbox" id="chk-top-${t.id_topping}" value="${t.id_topping}" data-precio="${t.toppings.precio_adicional}" onclick="event.stopPropagation(); calcularTotal();" style="margin-right:10px; accent-color:#D67280;">
                                <span style="color:#6D3B37; font-size:0.9rem;">${escapeHtml(t.toppings.nombre)}</span>
                            </div>
                            <span style="color:#D67280; font-weight:bold; font-size:0.85rem;">+$${formatearPrecio(t.toppings.precio_adicional)}</span>
                        </div>`;
                });
            } else {
                containerToppings.innerHTML = '<p style="font-size:0.85rem; color:#888; text-align:center; padding:10px; margin:0;">No hay toppings disponibles.</p>';
            }
        }

        const txtNotas = document.getElementById('modal-observaciones');
        if (txtNotas) txtNotas.value = '';

        evaluarVisibilidadToppings();
        calcularTotal();

        const modal = document.getElementById('lc-topping-modal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('active');
        }
    } catch (err) {
        console.error('Error al abrir el modal del producto:', err);
        alert('No se pudieron cargar los detalles del producto.');
    }
}

function cerrarModal() {
    var modal = document.getElementById('lc-topping-modal');
    if (modal) modal.style.display = 'none';
}

function alternarCheckbox(idTopping) {
    var cb = document.getElementById('chk-top-' + idTopping);
    if (cb) { cb.checked = !cb.checked; calcularTotal(); }
}

function calcularTotal() {
    let selectTamanio = document.getElementById('lc-product-tamanio');
    let precioTamanio = 0;

    if (selectTamanio && selectTamanio.selectedIndex >= 0) {
        let opcionSeleccionada = selectTamanio.options[selectTamanio.selectedIndex];
        let valorAttr = opcionSeleccionada.getAttribute('data-precio') || '0';
        precioTamanio = parseFloat(valorAttr) || 0;
    }

    let precioToppings = 0;
    let checkboxes = document.querySelectorAll('#modal-toppings-container input[type="checkbox"]:checked');
    checkboxes.forEach(function (cb) {
        let valorTopping = cb.getAttribute('data-precio') || '0';
        precioToppings += parseFloat(valorTopping) || 0;
    });

    let totalModal = precioTamanio + precioToppings;
    let totalElem = document.getElementById('modal-total-price');
    if (totalElem) {
        totalElem.innerText = '$' + totalModal.toLocaleString('es-CO');
    }
}

async function confirmarAgregado() {
    const txtNotas = document.getElementById('modal-observaciones');
    const selectTam = document.getElementById('lc-product-tamanio');
    const toppingsSeleccionados = [];

    document.querySelectorAll('#modal-toppings-container input[type="checkbox"]:checked').forEach(function (cb) {
        toppingsSeleccionados.push(parseInt(cb.value, 10));
    });

    const idTamanio = (selectTam && selectTam.value) ? parseInt(selectTam.value, 10) : null;
    const observaciones = txtNotas ? txtNotas.value : '';
    const sessionId = obtenerSessionId();

    try {
        // Precio del tamaño elegido (o precio base si no tiene tamaños)
        let precioBase;
        if (idTamanio) {
            const { data: pt } = await sb
                .from('producto_tamanios')
                .select('precio')
                .eq('id_producto', idProductoSeleccionado)
                .eq('id_tamanio', idTamanio)
                .single();
            precioBase = pt ? Number(pt.precio) : Number(productosCache[idProductoSeleccionado].precio);
        } else {
            precioBase = Number(productosCache[idProductoSeleccionado].precio);
        }

        // Sumar precio de toppings elegidos
        let precioToppings = 0;
        if (toppingsSeleccionados.length > 0) {
            const { data: topsInfo } = await sb
                .from('toppings')
                .select('id_topping, precio_adicional')
                .in('id_topping', toppingsSeleccionados);
            precioToppings = (topsInfo || []).reduce((acc, t) => acc + Number(t.precio_adicional), 0);
        }

        const precioUnitario = precioBase + precioToppings;

        // ¿Ya existe en el carrito la misma combinación (producto + tamaño + mismos toppings)?
        const idExistente = await buscarItemCarritoIdentico(sessionId, idProductoSeleccionado, idTamanio, toppingsSeleccionados);

        if (idExistente) {
            const { data: itemActual } = await sb.from('carrito_items').select('cantidad').eq('id', idExistente).single();
            await sb.from('carrito_items').update({ cantidad: (itemActual ? itemActual.cantidad : 1) + 1 }).eq('id', idExistente);
        } else {
            // Se añade "id_combo: null" para evitar conflictos con la restricción de la base de datos
            const { data: nuevoItem, error } = await sb
                .from('carrito_items')
                .insert({
                    session_id: sessionId,
                    id_producto: idProductoSeleccionado,
                    id_combo: null,
                    id_tamanio: idTamanio,
                    cantidad: 1,
                    precio_unitario: precioUnitario,
                    observaciones: observaciones
                })
                .select()
                .single();
            if (error) throw error;

            if (toppingsSeleccionados.length > 0) {
                const filas = toppingsSeleccionados.map(idTop => ({ id_carrito_item: nuevoItem.id, id_topping: idTop }));
                const { error: errTopIns } = await sb.from('carrito_item_toppings').insert(filas);
                if (errTopIns) throw errTopIns;
            }
        }

        mostrarMensajeExito('¡Agregado al carrito!');
        cerrarModal();
        actualizarContadorYDatosCarrito();
    } catch (err) {
        console.error('Error al agregar al carrito:', err);
        alert('Hubo un error al agregar el producto al carrito. Revisa la consola para más detalles.');
    }
}

async function buscarItemCarritoIdentico(sessionId, idProducto, idTamanio, toppingsSeleccionados) {
    let query = sb
        .from('carrito_items')
        .select('id, carrito_item_toppings(id_topping)')
        .eq('session_id', sessionId)
        .eq('id_producto', idProducto);

    query = idTamanio ? query.eq('id_tamanio', idTamanio) : query.is('id_tamanio', null);

    const { data: candidatos, error } = await query;
    if (error || !candidatos) return null;

    const claveNueva = [...toppingsSeleccionados].sort((a, b) => a - b).join(',');
    for (const c of candidatos) {
        const claveExistente = (c.carrito_item_toppings || [])
            .map(t => t.id_topping)
            .sort((a, b) => a - b)
            .join(',');
        if (claveExistente === claveNueva) return c.id;
    }
    return null;
}

// ─────────────────────────────────────────────────────────
//  PANEL CARRITO
// ─────────────────────────────────────────────────────────

function abrirPanelCarrito() {
    var panel = document.getElementById('lc-cart-panel');
    if (panel) panel.style.right = '0px';
    actualizarContadorYDatosCarrito();
}

function cerrarPanelCarrito() {
    var panel = document.getElementById('lc-cart-panel');
    if (panel) panel.style.right = '-350px';
}

async function actualizarContadorYDatosCarrito() {
    const sessionId = obtenerSessionId();
    const cartCountElem = document.getElementById('lc-cart-count');
    const container = document.getElementById('lc-cart-items-container');

    try {
        const { data: items, error } = await sb
            .from('carrito_items')
            .select(`
                id,
                cantidad,
                precio_unitario,
                id_producto,
                id_tamanio,
                id_combo,
                productos ( nombre ),
                tamanios ( nombre ),
                combos ( nombre, descripcion ),
                carrito_item_toppings ( toppings ( nombre ) )
            `)
            .eq('session_id', sessionId)
            .order('id', { ascending: true });

        if (error) throw error;

        if (cartCountElem) cartCountElem.innerText = (items || []).reduce((acc, it) => acc + it.cantidad, 0);

        if (!container) return;
        container.innerHTML = '';

        if (!items || items.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#888; margin-top:20px;">Tu carrito está vacío.</p>';
            const totalElemVacio = document.getElementById('lc-cart-grand-total');
            if (totalElemVacio) totalElemVacio.setAttribute('data-subtotal', 0);
            _resetearPropina();
            actualizarTotalConPropina(0);
            return;
        }

        let grandTotal = 0;

        items.forEach(function (item) {
            const precioTotalItem = Number(item.precio_unitario) * item.cantidad;
            grandTotal += precioTotalItem;

            let nombreMostrar, detallesHtml;

            if (item.id_combo) {
                nombreMostrar = item.combos ? item.combos.nombre : 'Combo';
                detallesHtml = `<span>🎁 Combo${item.combos && item.combos.descripcion ? ' — ' + escapeHtml(item.combos.descripcion) : ''}</span>`;
            } else {
                const nombreProducto = item.productos ? item.productos.nombre : 'Producto';
                const nombreTamanio = item.tamanios ? item.tamanios.nombre : 'Estándar';
                const nombresToppings = (item.carrito_item_toppings || [])
                    .map(t => t.toppings ? t.toppings.nombre : null)
                    .filter(Boolean);

                const toppingsHtml = nombresToppings.length > 0
                    ? `<span style="color: #bcbcbc;">+ ${escapeHtml(nombresToppings.join(', '))}</span>`
                    : `<span>Sin adiciones</span>`;

                nombreMostrar = nombreProducto;
                detallesHtml = `<span>Tamaño: ${escapeHtml(nombreTamanio)}</span>${toppingsHtml}`;
            }

            let itemHtml = `
                <div class="lc-cart-item-card">
                    <span class="lc-cart-item-remove" onclick="eliminarProductoCompleto(${item.id})">&times;</span>

                    <h4 style="margin:0 0 4px 0; font-size:14px; color:#444; font-weight:600;">${escapeHtml(nombreMostrar)}</h4>

                    <div class="lc-cart-item-details">
                        ${detallesHtml}
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
                        <span style="font-weight:700; color:#444; font-size:13px;">$${formatearPrecio(precioTotalItem)}</span>

                        <div class="lc-cart-qty-control">
                            <button type="button" onclick="alterarCantidad(${item.id}, 'RESTAR')" style="border:none; background:none; color:#9C5F5A; font-weight:bold; cursor:pointer; padding:0 4px;">-</button>
                            <span style="font-size:12px; font-weight:700; color:#444; min-width:10px; text-align:center;">${item.cantidad}</span>
                            <button type="button" onclick="alterarCantidad(${item.id}, 'SUMAR')" style="border:none; background:none; color:#9C5F5A; font-weight:bold; cursor:pointer; padding:0 4px;">+</button>
                        </div>
                    </div>
                </div>
            `;
            container.innerHTML += itemHtml;
        });

        const totalElem = document.getElementById('lc-cart-grand-total');
        if (totalElem) totalElem.setAttribute('data-subtotal', grandTotal);

        actualizarTotalConPropina(grandTotal);
    } catch (err) {
        console.error('Error al actualizar el carrito:', err);
    }
}


function abrirModalPropina() {
    var modal = document.getElementById('lc-tip-modal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

function cerrarModalPropina() {
    var modal = document.getElementById('lc-tip-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

function guardarPropina() {
    var subtotal = _obtenerSubtotal();
    actualizarTotalConPropina(subtotal);
    cerrarModalPropina();
}

function _resetearPropina() {
    var inputValor = document.getElementById('lc-tip-input-valor');
    if (inputValor) inputValor.value = '';
    _seleccionarTipoPropina('porcentaje', false);
}

function _aplicarEstilo(el, estilos) {
    if (!el) return;
    el.style.background = estilos.background;
    el.style.color = estilos.color;
    el.style.borderColor = estilos.borderColor;
}

function _seleccionarTipoPropina(tipo, recalcular) {
    var btnPct = document.getElementById('lc-tip-tipo-pct');
    var btnVal = document.getElementById('lc-tip-tipo-val');
    var labelInput = document.getElementById('lc-tip-label-input');
    var inputValor = document.getElementById('lc-tip-input-valor');

    var estiloActivo = { background: '#D67280', color: '#fff', borderColor: '#D67280' };
    var estiloInactivo = { background: '#fff', color: '#9C5F5A', borderColor: '#D67280' };

    if (tipo === 'porcentaje') {
        _aplicarEstilo(btnPct, estiloActivo);
        _aplicarEstilo(btnVal, estiloInactivo);
        if (labelInput) labelInput.innerText = 'Ingresa el porcentaje (%):';
        if (inputValor) {
            inputValor.placeholder = 'Ej: 10';
            inputValor.setAttribute('data-tipo', 'porcentaje');
        }
    } else {
        _aplicarEstilo(btnVal, estiloActivo);
        _aplicarEstilo(btnPct, estiloInactivo);
        if (labelInput) labelInput.innerText = 'Ingresa el valor ($):';
        if (inputValor) {
            inputValor.placeholder = 'Ej: 2000';
            inputValor.setAttribute('data-tipo', 'valor');
        }
    }

    if (recalcular !== false) {
        if (inputValor) inputValor.value = '';
        var subtotal = _obtenerSubtotal();
        actualizarTotalConPropina(subtotal);
    }
}

function seleccionarTipoPropina(tipo) {
    _seleccionarTipoPropina(tipo, true);
}

function _obtenerSubtotal() {
    var elem = document.getElementById('lc-cart-grand-total');
    if (!elem) return 0;
    var raw = elem.getAttribute('data-subtotal');
    return parseFloat(raw) || 0;
}

function _calcularMontoPropina(subtotal) {
    var inputValor = document.getElementById('lc-tip-input-valor');
    if (!inputValor || inputValor.value.trim() === '') return 0;

    var tipo = inputValor.getAttribute('data-tipo') || 'porcentaje';
    var valorIngresado = parseFloat(inputValor.value.replace(',', '.')) || 0;

    if (tipo === 'porcentaje') {
        return Math.round((subtotal * valorIngresado) / 100);
    } else {
        return Math.round(valorIngresado);
    }
}

function actualizarPropina() {
    var subtotal = _obtenerSubtotal();
    actualizarTotalConPropina(subtotal);
}

function actualizarTotalConPropina(subtotal) {
    var montoPropina = _calcularMontoPropina(subtotal);
    var totalFinal = subtotal + montoPropina;

    var labelPropina = document.getElementById('lc-tip-monto-label');
    if (labelPropina) {
        if (montoPropina > 0) {
            labelPropina.innerText = 'Propina: $' + montoPropina.toLocaleString('es-CO');
            labelPropina.style.display = 'block';
        } else {
            labelPropina.style.display = 'none';
        }
    }

    var totalElem = document.getElementById('lc-cart-grand-total');
    if (totalElem) {
        totalElem.innerText = '$' + totalFinal.toLocaleString('es-CO');
    }

    actualizarResumenPropina(montoPropina);
}

function actualizarResumenPropina(montoPropina) {
    var resumen = document.getElementById('lc-tip-resumen');
    if (!resumen) return;

    if (montoPropina > 0) {
        resumen.innerText = 'Propina: $' + montoPropina.toLocaleString('es-CO') + ' ✅';
    } else {
        resumen.innerText = 'Agregar propina';
    }
}

// ─────────────────────────────────────────────────────────
//  MODIFICAR CANTIDADES / ELIMINAR
// ─────────────────────────────────────────────────────────

async function eliminarProductoCompleto(idCarritoItem) {
    try {
        const { error } = await sb.from('carrito_items').delete().eq('id', idCarritoItem);
        if (error) throw error;
        actualizarContadorYDatosCarrito();
    } catch (err) {
        console.error('Error al eliminar item:', err);
    }
}

async function alterarCantidad(idCarritoItem, accion) {
    try {
        const { data: row, error: errSel } = await sb
            .from('carrito_items')
            .select('cantidad')
            .eq('id', idCarritoItem)
            .single();
        if (errSel) throw errSel;

        if (accion === 'SUMAR') {
            const { error } = await sb.from('carrito_items').update({ cantidad: row.cantidad + 1 }).eq('id', idCarritoItem);
            if (error) throw error;
        } else if (accion === 'RESTAR') {
            if (row.cantidad > 1) {
                const { error } = await sb.from('carrito_items').update({ cantidad: row.cantidad - 1 }).eq('id', idCarritoItem);
                if (error) throw error;
            } else {
                const { error } = await sb.from('carrito_items').delete().eq('id', idCarritoItem);
                if (error) throw error;
            }
        }
        actualizarContadorYDatosCarrito();
    } catch (err) {
        console.error('Error al alterar cantidad:', err);
    }
}

// ─────────────────────────────────────────────────────────
//  WHATSAPP
// ─────────────────────────────────────────────────────────

async function procesarPedidoWhatsApp() {
    var entrega = document.getElementById('lc-cart-entrega').value;
    var direccion = document.getElementById('lc-cart-direccion').value;
    var pago = document.getElementById('lc-cart-pago').value;
    var totalText = document.getElementById('lc-cart-grand-total').innerText;

    if (entrega === 'Domicilio' && direccion.trim() === '') {
        alert('⚠️ Por favor, ingresa tu dirección para el domicilio.');
        document.getElementById('lc-cart-direccion').focus();
        return;
    }

    var subtotal = _obtenerSubtotal();
    var montoPropina = _calcularMontoPropina(subtotal);

    var mensaje = '¡Hola Le Crème! 🧁 Confirmar pedido:\n\n';
    document.querySelectorAll('.lc-cart-item-card').forEach(function (item) {
        let nombre = item.querySelector('h4').innerText;
        let detalles = item.querySelector('.lc-cart-item-details').innerText.replace(/\n/g, ' | ');
        let precio = item.querySelector('span[style*="font-weight:700"]').innerText;
        mensaje += `▪️ ${nombre}\n   Detalles: ${detalles}\n   Subtotal: ${precio}\n\n`;
    });

    if (montoPropina > 0) {
        mensaje += `💝 Propina: $${montoPropina.toLocaleString('es-CO')}\n`;
    }

    mensaje += '📦 Entrega: ' + entrega;
    if (entrega === 'Domicilio') {
        mensaje += '\n📍 Dirección: ' + direccion;
        mensaje += '\n🛵 Valor domicilio: Por confirmar';
    }
    mensaje += '\n💰 Pago: ' + pago;
    mensaje += '\n💵 Total final: ' + totalText;

    try {
        const { data: config, error } = await sb
            .from('lc_configuracion')
            .select('whatsapp_recepcion')
            .eq('id_config_tienda', 1)
            .single();

        if (error || !config) {
            alert('No se pudo obtener el número de WhatsApp de la tienda.');
            return;
        }

        var numWhatsApp = (config.whatsapp_recepcion || '').replace(/\D/g, '');
        window.open('https://wa.me/' + numWhatsApp + '?text=' + encodeURIComponent(mensaje), '_blank');

        // El pedido ya se envió por WhatsApp: vaciamos el carrito para el próximo pedido
        await vaciarCarritoTrasPedido();
    } catch (err) {
        console.error('Error al obtener WhatsApp:', err);
    }
}

async function vaciarCarritoTrasPedido() {
    try {
        const sessionId = obtenerSessionId();
        const { error } = await sb.from('carrito_items').delete().eq('session_id', sessionId);
        if (error) throw error;
        document.getElementById('lc-cart-direccion').value = '';
        cerrarPanelCarrito();
        actualizarContadorYDatosCarrito();
    } catch (err) {
        console.error('Error al vaciar el carrito tras el pedido:', err);
    }
}

// ─────────────────────────────────────────────────────────
//  BÚSQUEDA DE PRODUCTOS (sin cambios, opera sobre el DOM ya renderizado)
// ─────────────────────────────────────────────────────────

function filtrarProductosHome() {
    let inputElement = document.getElementById('lc-home-search');
    if (!inputElement) return;

    let inputVal = inputElement.value.trim();
    let inputLower = inputVal.toLowerCase();
    let searchWrapper = inputElement.parentElement;
    let suggestionsContainer = document.getElementById('lc-search-suggestions');

    if (!suggestionsContainer) {
        suggestionsContainer = document.createElement('div');
        suggestionsContainer.id = 'lc-search-suggestions';
        suggestionsContainer.style.position = 'absolute';
        suggestionsContainer.style.backgroundColor = '#fff';
        suggestionsContainer.style.border = '1px solid #D67280';
        suggestionsContainer.style.borderRadius = '12px';
        suggestionsContainer.style.width = inputElement.offsetWidth + 'px';
        suggestionsContainer.style.maxHeight = '280px';
        suggestionsContainer.style.overflowY = 'auto';
        suggestionsContainer.style.zIndex = '9999';
        suggestionsContainer.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
        suggestionsContainer.style.marginTop = '5px';
        searchWrapper.appendChild(suggestionsContainer);
    }

    suggestionsContainer.innerHTML = '';
    if (inputLower.length < 3) {
        suggestionsContainer.style.display = 'none';
        return;
    }

    let coincidencias = 0;

    document.querySelectorAll('.lc-product-item').forEach(function (prod) {
        let h4Element = prod.querySelector('h4');
        if (h4Element) {
            let nombreProducto = h4Element.innerText;

            if (nombreProducto.toLowerCase().includes(inputLower)) {
                coincidencias++;

                let imgSrc = prod.querySelector('.lc-product-img') ? prod.querySelector('.lc-product-img').src : LOGO_URL;
                let precioText = prod.querySelector('.lc-product-price') ? prod.querySelector('.lc-product-price').innerText : '$0';

                let item = document.createElement('div');
                item.className = 'lc-search-item-row';
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.style.padding = '10px 14px';
                item.style.cursor = 'pointer';
                item.style.borderBottom = '1px solid #f1f5f9';
                item.style.transition = 'background-color 0.2s ease';

                item.onmouseenter = function () { this.style.backgroundColor = '#fcedeb'; };
                item.onmouseleave = function () { this.style.backgroundColor = '#fff'; };

                item.innerHTML = `
                    <img src="${imgSrc}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 8px; margin-right: 12px; border: 1px solid #f3e8e9;" onerror="this.src='${LOGO_URL}';">
                    <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 2px;">
                        <span style="font-size: 0.9rem; font-weight: 600; color: #6D3B37;">${escapeHtml(nombreProducto)}</span>
                        <span style="font-size: 0.8rem; font-weight: 700; color: #D67280;">${precioText}</span>
                    </div>
                    <span style="font-size: 1.1rem; color: #9C5F5A;">➕</span>
                `;

                item.onclick = function () {
                    let btnAdd = prod.querySelector('.lc-btn-add');
                    if (btnAdd) btnAdd.click();
                    suggestionsContainer.style.display = 'none';
                    inputElement.value = '';
                };

                suggestionsContainer.appendChild(item);
            }
        }
    });

    if (coincidencias === 0) {
        let noResult = document.createElement('div');
        noResult.innerText = 'No se encontraron productos 🧁';
        noResult.style.padding = '15px';
        noResult.style.textAlign = 'center';
        noResult.style.color = '#888';
        noResult.style.fontSize = '0.85rem';
        suggestionsContainer.appendChild(noResult);
    }

    suggestionsContainer.style.display = 'block';
}

document.addEventListener('click', function (event) {
    let suggestionsContainer = document.getElementById('lc-search-suggestions');
    let searchInput = document.getElementById('lc-home-search');
    if (suggestionsContainer && event.target !== searchInput) {
        suggestionsContainer.style.display = 'none';
    }
});
