// ============================================================
//  LE CRÈME — app.js
//  Migrado de Oracle APEX a Supabase. Usa el cliente global `sb`
//  definido en config.js.
// ============================================================

let idProductoSeleccionado = 0;
const productosCache = {};   // id_producto -> fila de productos
const categoriasConfig = {}; // id_categoria -> fila de categorias (para saber lleva_toppings)
const combosCache = {};      // id_combo -> fila de combos
const comboGruposCache = {};     // id_combo -> array de grupos
const comboProductosCache = {};  // id_grupo -> array de productos del grupo

const LOGO_URL = 'https://yimihpnzkpvqizojpewk.supabase.co/storage/v1/object/public/Menu/Favicon/IMAGEN%20LECREME.jpg'; 
const DEFAULT_WHATSAPP_NUMBER = '573148679569';
const SUPABASE_TIMEOUT_MS = 8000;
let pedidoEnProceso = false;

document.addEventListener('DOMContentLoaded', function () {
    renderizarPagina();
    renderizarCombos();
    actualizarContadorYDatosCarrito();

    // ==========================================
    // 🌟 NUEVA LÓGICA DE SCROLL Y LUPA INTERACTIVA
    // ==========================================
    const header = document.querySelector(".lc-main-header");
    const btnBuscar = document.getElementById("lc-btn-buscar");
    const searchContainer = document.getElementById("lc-search-container");
    const searchInput = document.getElementById("lc-home-search");

    let isShrink = false;

    // 1. Control de scroll suave sin parpadeos (Histeresis)
    window.addEventListener("scroll", () => {
        const scrollTop = window.scrollY;

        if (!isShrink && scrollTop > 90) {
            header.classList.add("shrink");
            header.classList.remove("expanded");
            isShrink = true;
        } else if (isShrink && scrollTop < 15) { // Evita el bucle estático
            header.classList.add("expanded");
            header.classList.remove("shrink");
            isShrink = false;
        }
    });

    // 2. Escuchar el clic en la lupa para expandir el buscador
    if (btnBuscar && searchContainer) {
        btnBuscar.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation(); // Evita que otros clics del documento lo cierren al mismo tiempo
            
            // Alterna la clase activa que le da altura y opacidad en el CSS
            searchContainer.classList.toggle("active");
            
            // Si se abre, enfoca el cursor automáticamente para escribir directo
            if (searchContainer.classList.contains("active")) {
                setTimeout(() => {
                    searchInput.focus();
                }, 100);
            }
        });
    }

    // 3. Cerrar el buscador automáticamente si tocan fuera del header
    document.addEventListener("click", (e) => {
        if (header && !header.contains(e.target)) {
            if (searchContainer) {
                searchContainer.classList.remove("active");
            }
        }
    });
    // ==========================================
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
        // Antes: 1 consulta de categorías + 1 consulta de productos POR CADA categoría (secuencial).
        // Ahora: solo 2 consultas en total, en paralelo. Mucho más rápido.
        const [{ data: categorias, error: errCat }, { data: productos, error: errProd }] = await Promise.all([
            sb.from('categorias')
              .select('*')
              .eq('activo', 'S')
              .order('orden_mostrar', { ascending: true })
              .order('id_categoria', { ascending: true }),
            sb.from('productos')
              .select('*')
              .eq('activo', 'S')
              .order('orden_mostrar', { ascending: true })
              .order('id_producto', { ascending: true })
        ]);

        if (errCat) throw errCat;
        if (errProd) throw errProd;

        listaCategorias.innerHTML = '';
        seccionesProductos.innerHTML = '';

        if (!categorias || categorias.length === 0) {
            listaCategorias.innerHTML = '<p style="padding:10px; color:#888;">No hay categorías activas todavía.</p>';
            return;
        }

        // Agrupamos los productos por categoría en memoria (ya los traemos todos de una sola vez)
        const productosPorCategoria = {};
        (productos || []).forEach(prod => {
            productosCache[prod.id_producto] = prod;
            if (!productosPorCategoria[prod.id_categoria]) productosPorCategoria[prod.id_categoria] = [];
            productosPorCategoria[prod.id_categoria].push(prod);
        });

        categorias.forEach(cat => {
            categoriasConfig[cat.id_categoria] = cat;
            listaCategorias.appendChild(crearCategoriaItem(cat));

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

            (productosPorCategoria[cat.id_categoria] || []).forEach(prod => {
                grid.appendChild(crearProductoCard(prod));
            });

            seccionesProductos.appendChild(wrapper);
        });
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
    const section = document.getElementById('lc-combos-section');
    const container = document.getElementById('lc-combos-container');
    if (!container || !section) return;

    try {
        // 1. Traer los combos activos
        const { data: combos, error: comboErr } = await sb
            .from('combos')
            .select('*')
            .eq('estado', 'Activo');

        if (comboErr) throw comboErr;

        if (!combos || combos.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        container.innerHTML = '';

        // 2. Traer TODOS los grupos y TODOS los productos de combos de una sola vez para guardarlos en caché
        const comboIds = combos.map(c => c.id_combo);
        
        const [gruposRes, productosRes] = await Promise.all([
            sb.from('combo_grupos').select('*').in('id_combo', comboIds),
            sb.from('combo_productos').select('*')
        ]);

        // Guardar grupos en caché organizados por id_combo
        if (gruposRes.data) {
            gruposRes.data.forEach(grupo => {
                if (!comboGruposCache[grupo.id_combo]) comboGruposCache[grupo.id_combo] = [];
                comboGruposCache[grupo.id_combo].push(grupo);
            });
        }

        // Guardar productos de combos en caché organizados por id_grupo
        if (productosRes.data) {
            productosRes.data.forEach(prod => {
                if (!comboProductosCache[prod.id_grupo]) comboProductosCache[prod.id_grupo] = [];
                comboProductosCache[prod.id_grupo].push(prod);
            });
        }

        // 3. Renderizar los combos usando el ciclo normal
        combos.forEach(combo => {
            combosCache[combo.id_combo] = combo;

            let card = document.createElement('div');
            card.className = 'lc-combo-card';
            
            let imgUrl = combo.imagen_url || LOGO_URL;

            card.innerHTML = `
                <div class="lc-combo-img-wrapper">
                    <img src="${imgUrl}" alt="${combo.nombre}" onerror="this.src='${LOGO_URL}'">
                </div>
                <div class="lc-combo-info">
                    <h3>${combo.nombre}</h3>
                    <p class="lc-combo-desc">${combo.descripcion || ''}</p>
                    <div class="lc-combo-footer">
                        <span class="lc-combo-price">$${formatearPrecio(combo.precio_base)}</span>
                        <button class="lc-btn-add-combo" onclick="agregarComboAlCarrito(${combo.id_combo})">
                            Agregar ➕
                        </button>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

    } catch (err) {
        console.error("Error cargando combos:", err);
        section.style.display = 'none';
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

const GRANIZADOS_SABORES_FIJOS = ['Maracuyá', 'Lulo', 'Mora', 'Limón', 'Fresa'];

let comboSeleccionadoGranizados = null; // { idCombo, tipo: 'COMBO1'|'COMBO2'|'COMBO3' }

// Selecciones dinámicas (requiere_opciones / lista_opciones)
let idSeleccionDinamicForModal = null; // { tipo: 'producto'|'combo', id: number }

function renderizarSelectOpcionesDinamicas(listaOpciones) {
    const containerToppings = document.getElementById('modal-toppings-container');
    const tituloToppings = document.getElementById('titulo-toppings');

    if (!containerToppings || !tituloToppings) return;

    const opciones = (listaOpciones || '')
        .split(',')
        .map(x => String(x).trim())
        .filter(Boolean);

    if (opciones.length === 0) {
        containerToppings.innerHTML = '';
        tituloToppings.style.display = 'none';
        return;
    }

    tituloToppings.style.display = 'block';
    tituloToppings.innerText = 'Elige una opción:';

    containerToppings.innerHTML = `
        <div>
            <select id="lc-opciones-dinamicas" class="lc-opciones-dinamicas" style="width:100%; padding:8px; border-radius:8px; border:1px solid #ccc; margin-top:6px;">
                <option value="">-- Selecciona --</option>
                ${opciones.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}
            </select>
        </div>
    `;
}

function validarSeleccionOpcionesDinamicas() {
    const sel = document.getElementById('lc-opciones-dinamicas');
    if (!sel) return { ok: true, texto: null };
    const v = String(sel.value || '').trim();
    if (!v) return { ok: false, texto: null };
    return { ok: true, texto: v };
}

function obtenerObservacionesCombinadas(obsBase, obsOpcional) {
    const a = (obsBase || '').trim();
    const b = (obsOpcional || '').trim();
    if (!a && !b) return null;
    if (a && !b) return a;
    if (!a && b) return b;
    return `${a} | ${b}`;
}


function limpiarUIGranizadosEnModal() {

    // Limpia contenedor de toppings y también la sección de observaciones si aplica
    const containerToppings = document.getElementById('modal-toppings-container');
    if (containerToppings) containerToppings.innerHTML = '';

    const tituloToppings = document.getElementById('titulo-toppings');
    if (tituloToppings) tituloToppings.style.display = 'block';

    // Reutilizamos el textarea de notas generales
    const txtNotas = document.getElementById('modal-observaciones');
    if (txtNotas) txtNotas.value = '';
}

function setModoModalParaCombo(combo) {
    // Cambiar textos del modal principales
    document.getElementById('lc-modal-title').innerText = combo.nombre;
    document.getElementById('lc-modal-desc').innerText = combo.descripcion || '';
    
    let modalImg = document.getElementById('lc-modal-img');
    if (modalImg) {
        modalImg.src = combo.imagen_url || LOGO_URL;
    }

    // Limpiar secciones innecesarias para combos
    const toppingsSection = document.getElementById('lc-modal-toppings-section');
    if (toppingsSection) toppingsSection.style.display = 'none';
    
    const sizesSection = document.getElementById('lc-modal-sizes-section');
    if (sizesSection) sizesSection.style.display = 'none';

    // Obtener los grupos directamente desde el CÁCHÉ LOCAL
    const grupos = comboGruposCache[combo.id_combo] || [];
    
    const combosSection = document.getElementById('lc-modal-combos-section');
    combosSection.style.display = 'block';
    combosSection.innerHTML = ''; // Limpiar opciones anteriores

    // Renderizar cada grupo usando los datos del caché
    grupos.forEach(grupo => {
        let grupoDiv = document.createElement('div');
        grupoDiv.className = 'lc-modal-combo-group';
        grupoDiv.setAttribute('data-id-grupo', grupo.id_grupo);
        grupoDiv.setAttribute('data-nombre-grupo', grupo.nombre_grupo);
        grupoDiv.setAttribute('data-seleccion-max', grupo.seleccion_maxima);

        grupoDiv.innerHTML = `
            <h4>${grupo.nombre_grupo} <span class="lc-group-limit">(Selecciona máximo ${grupo.seleccion_maxima})</span></h4>
            <div class="lc-combo-options-list"></div>
        `;

        let optionsList = grupoDiv.querySelector('.lc-combo-options-list');

        // Obtener productos de este grupo desde el CÁCHÉ LOCAL
        const productosDelGrupo = comboProductosCache[grupo.id_grupo] || [];

        productosDelGrupo.forEach(prod => {
            let itemDiv = document.createElement('div');
            itemDiv.className = 'lc-combo-option-item';
            
            // Buscar si el producto existe en el productosCache general para saber si lleva topping o el nombre real
            const datosProdGeneral = productosCache[prod.id_producto] || {};
            const precioExtra = prod.precio_adicional > 0 ? `(+ $${formatearPrecio(prod.precio_adicional)})` : '';
            
            itemDiv.innerHTML = `
                <label class="lc-checkbox-container">
                    <input type="checkbox" 
                           value="${prod.id_producto}" 
                           data-precio-adicional="${prod.precio_adicional}"
                           data-nombre="${prod.nombre_producto}"
                           onchange="validarSeleccionGrupo(this, ${grupo.seleccion_maxima})">
                    <span class="lc-checkmark"></span>
                    <span class="lc-option-text">${prod.nombre_producto} ${precioExtra}</span>
                </label>
            `;
            optionsList.appendChild(itemDiv);
        });

        combosSection.appendChild(grupoDiv);
    });

    // Configurar el botón de confirmación del modal para combos
    let btnConfirmar = document.getElementById('lc-btn-modal-confirmar');
    btnConfirmar.onclick = function() {
        procesarConfirmacionCombo(combo.id_combo);
    };

    calcularTotal(); 
    abrirModal();
}

// 👀 Función auxiliar para controlar que no marquen más checkboxes de los permitidos por grupo
function validarMaximoCheckboxesTienda(el) {
    const idx = el.dataset.grupoIdx;
    const max = parseInt(el.dataset.max, 10);
    const seleccionados = document.querySelectorAll(`.lc-combo-grupo-chk[data-grupo-idx="${idx}"]:checked`);
    
    if (seleccionados.length > max) {
        el.checked = false;
        alert(`Solo puedes seleccionar hasta ${max} opciones en esta sección.`);
    }
}



async function guardarComboConGranizadosEnCarrito() {
    if (!comboSeleccionadoGranizados) return;
    const { idCombo } = comboSeleccionadoGranizados;
    const combo = combosCache[idCombo];
    if (!combo) return;

    // COMBO sin opciones dinámicas
    if (!combo?.requiere_opciones && comboSeleccionadoGranizados.tipo === 'COMBO3') {
        const txtNotas = document.getElementById('modal-observaciones');
        const notasGenerales = txtNotas?.value?.trim() ? txtNotas.value.trim() : '';
        await insertarComboEnCarrito(idCombo, notasGenerales || null);
        return;
    }

    // 🎯 NUEVA VALIDACIÓN: Recorrer cada bloque de grupo renderizado
    const bloques = document.querySelectorAll('#modal-toppings-container .bloque-grupo-tienda');
    let resumenElecciones = [];

    for (const bloque of bloques) {
        const nombreGrupo = bloque.dataset.nombreGrupo;
        let eleccionesGrupo = [];

        // Mirar si tiene un select sencillo
        const select = bloque.querySelector('.lc-combo-grupo-select');
        if (select) {
            const v = select.value.trim();
            if (!v) {
                alert(`Por favor, completa la sección: "${nombreGrupo}".`);
                return;
            }
            eleccionesGrupo.push(v);
        } 
        // Mirar si tiene checkboxes múltiples
        else {
            const chks = bloque.querySelectorAll('.lc-combo-grupo-chk:checked');
            const chkTodos = bloque.querySelectorAll('.lc-combo-grupo-chk');
            const maxPermitido = chkTodos.length > 0 ? parseInt(chkTodos[0].dataset.max, 10) : 1;

            if (chks.length < maxPermitido) {
                alert(`Por favor, selecciona las ${maxPermitido} opciones requeridas en: "${nombreGrupo}".`);
                return;
            }
            chks.forEach(c => eleccionesGrupo.push(c.value));
        }

        // Armamos la línea legible del grupo, ej: "Sándwich: Especial" o "Granizados: Mora, Lulo"
        resumenElecciones.push(`${nombreGrupo}: ${eleccionesGrupo.join(', ')}`);
    }

    // Unimos todas las elecciones de los grupos con un separador limpio
    const obsGran = resumenElecciones.join(' | ');

    const txtNotas = document.getElementById('modal-observaciones');
    const notasGenerales = txtNotas?.value?.trim() ? txtNotas.value.trim() : '';

    const observaciones = notasGenerales
        ? obtenerObservacionesCombinadas(obsGran, notasGenerales)
        : obsGran;

    await insertarComboEnCarrito(idCombo, observaciones);
}


async function insertarComboEnCarrito(idCombo, observaciones) {
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

        // Si ya existe un combo igual en carrito, no combinamos observaciones.
        // Por eso, cuando hay observaciones de granizados, agregamos una nueva fila.
        const requiereDiferenciacion = !!observaciones;
        if (existentes && existentes.length > 0 && !requiereDiferenciacion) {
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
                precio_unitario: Number(combo.precio_descuento),
                observaciones: observaciones || null
            });
            if (error) throw error;
        }

        mostrarMensajeExito('¡Combo agregado al carrito!');
        cerrarModal();
        comboSeleccionadoGranizados = null;
        actualizarContadorYDatosCarrito();
    } catch (err) {
        console.error('Error al agregar el combo:', err);
        alert('Hubo un error al agregar el combo al carrito.');
    }
}

async function agregarComboAlCarrito(idCombo) {
    const combo = combosCache[idCombo];
    if (!combo) return;

    // Reset antes de render
    comboSeleccionadoGranizados = null;

    // Render blindado del modal (combo) y abrir modal
    // Agregamos el await obligatorio aquí arriba 🏁
    await setModoModalParaCombo(combo);

    const modal = document.getElementById('lc-topping-modal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
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
    // Esta función se usa para productos.
    // Para combos, abrimos el mismo modal reutilizando lc-topping-modal,
    // por eso aquí limpiamos el selector dinámico si corresponde.
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
        // Opciones dinámicas (requiere_opciones/lista_opciones)
        idSeleccionDinamicForModal = null;
        if (prod?.requiere_opciones === true || prod?.requiere_opciones === 'Y' || prod?.requiere_opciones === 'S') {
            idSeleccionDinamicForModal = { tipo: 'producto', id: idProducto };
            // Renderiza selector en el mismo contenedor que usan toppings
           // renderizarSelectOpcionesDinamicas(prod.lista_opciones || '');
        } else {
            // Si no requiere opciones, limpia contenedor antes de cargar toppings
            const containerToppings = document.getElementById('modal-toppings-container');
            const tituloToppings = document.getElementById('titulo-toppings');
            if (tituloToppings) tituloToppings.style.display = llevaToppings === 'S' ? 'block' : 'none';
            if (containerToppings && llevaToppings !== 'S') containerToppings.innerHTML = '';
        }

        // --- Tamaños del producto (ordenados de más barato a más caro) ---
        const { data: tamanios, error: errTam } = await sb
            .from('producto_tamanios')
            .select('id_tamanio, precio, tamanios(nombre)')
            .eq('id_producto', idProducto)
            .order('precio', { ascending: true });
        if (errTam) throw errTam;


// --- TAMAÑOS DEL PRODUCTO CON VASOS VISUALES ---
        const selectTam = document.getElementById('lc-sizes-render-container');
        if (selectTam) {
            selectTam.innerHTML = '';
            
            if (tamanios && tamanios.length > 0) {
                tamanios.forEach((t, index) => {
                    const nombreTam = t.tamanios ? t.tamanios.nombre : 'Tamaño';
                    // Crea una clase limpia sin espacios para escalar el vasito (ej: size-12oz)
                    const claseMedida = `size-${nombreTam.toLowerCase().replace(/\s+/g, '')}`;
                    // El primero de la lista se selecciona por defecto (.selected)
                    const claseSelected = index === 0 ? 'selected' : '';

                    selectTam.innerHTML += `
                        <div class="lc-size-option ${claseSelected} ${claseMedida}" 
                             data-id="${t.id_tamanio}" 
                             data-precio="${t.precio}" 
                             onclick="seleccionarTamañoElemento(this)">
                            
                            <div class="lc-size-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 100%; height: 100%;">
                                    <path d="M6 8c0-3 3-4 6-4s6 1 6 4" />
                                    <path d="M4 8h16" />
                                    <path d="M5.5 8l1.5 11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1.5-11" />
                                    <path d="M7 13h10" style="opacity: 0.4; stroke-width: 1.5;" />
                                </svg>
                            </div>
                            
                            <span class="lc-size-label">${nombreTam}</span>
                            <span class="lc-size-price">+$${formatearPrecio(t.precio)}</span>
                        </div>`;
                });
            } else {
                // Si el producto no tiene tamaños en BD, crea un vaso único estándar
                selectTam.innerHTML = `
                    <div class="lc-size-option selected size-12oz" 
                         data-id="" 
                         data-precio="${prod.precio}" 
                         onclick="seleccionarTamañoElemento(this)">
                        <div class="lc-size-icon-wrapper">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 100%; height: 100%;">
                                <path d="M6 8c0-3 3-4 6-4s6 1 6 4" />
                                <path d="M4 8h16" />
                                <path d="M5.5 8l1.5 11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1.5-11" />
                                <path d="M7 13h10" style="opacity: 0.4; stroke-width: 1.5;" />
                            </svg>
                        </div>
                        <span class="lc-size-label">Normal</span>
                        <span class="lc-size-price">$${formatearPrecio(prod.precio)}</span>
                    </div>`;
            }
        }
        const { data: toppings, error: errTop } = await sb
            .from('producto_toppings')
            .select('id_topping, toppings(nombre, precio_adicional, activo)')
            .eq('id_producto', idProducto);
        if (errTop) throw errTop;

        const containerToppings = document.getElementById('modal-toppings-container');
        // Si el producto requiere opciones dinámicas, mantenemos el <select> ya renderizado
        // y SOLO agregamos toppings debajo.
        const requiereOpcionesProd = !!(prod?.requiere_opciones === true || prod?.requiere_opciones === 'Y' || prod?.requiere_opciones === 'S');

        if (containerToppings) {
            const htmlSelectPrevio = document.getElementById('lc-opciones-dinamicas') ? containerToppings.innerHTML : '';
            containerToppings.innerHTML = htmlSelectPrevio || '';

            const activos = (toppings || []).filter(t => t.toppings && t.toppings.activo === 'S');

            if (activos.length > 0) {
                if (requiereOpcionesProd && htmlSelectPrevio) {
                    containerToppings.innerHTML += `<div style="margin-top:12px;"></div>`;
                }
                activos.forEach(t => {
                    containerToppings.innerHTML += `
                        <div class="lc-topping-item" onclick="alternarCheckbox(${t.id_topping})"
                            style="display:flex; justify-content:space-between; align-items:center; padding:10px; margin-top:6px; background:#fff; border:1px solid #f1f5f9; border-radius:8px; cursor:pointer;">
                            <div style="display:flex; align-items:center;">
                                <input type="checkbox" id="chk-top-${t.id_topping}" value="${t.id_topping}" data-precio="${t.toppings.precio_adicional}" onclick="event.stopPropagation(); calcularTotal();" style="margin-right:10px; accent-color:#D67280;">
                                <span style="color:#6D3B37; font-size:0.9rem;">${escapeHtml(t.toppings.nombre)}</span>
                            </div>
                            <span style="color:#D67280; font-weight:bold; font-size:0.85rem;">+$${formatearPrecio(t.toppings.precio_adicional)}</span>
                        </div>`;
                });
            } else {
                if (!document.getElementById('lc-opciones-dinamicas')) {
                    containerToppings.innerHTML = '<p style="font-size:0.85rem; color:#888; text-align:center; padding:10px; margin:0;">No hay toppings disponibles.</p>';
                }
            }
        }


        const txtNotas = document.getElementById('modal-observaciones');
        if (txtNotas) txtNotas.value = '';

        evaluarVisibilidadToppings();
        calcularTotal();

        // Pintar el select de bebida (cuando el producto lo requiere)
        inyectarBebidaDePreferencia(prod);





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
    // Blindaje: si el modal está en modo combo, NO ejecutar la lógica de productos.
    if (comboSeleccionadoGranizados && comboSeleccionadoGranizados.idCombo) {
        const combo = combosCache[comboSeleccionadoGranizados.idCombo];
        if (combo) {
            const totalElem = document.getElementById('modal-total-price');
            if (totalElem) totalElem.innerText = '$' + formatearPrecio(combo.precio_descuento);
        }
        return;
    }

    // BUSCAMOS EL VASITO QUE ESTÁ SELECCIONADO ACTUALMENTE
    let vasoSeleccionado = document.querySelector('.lc-size-option.selected');
    let precioTamanio = 0;

    if (vasoSeleccionado) {
        let valorAttr = vasoSeleccionado.getAttribute('data-precio') || '0';
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
    // Control central: si el modal está en modo combo, NO ejecutar flujo de producto.
    if (comboSeleccionadoGranizados && comboSeleccionadoGranizados.idCombo) {
        await guardarComboConGranizadosEnCarrito();
        return;
    }


    const txtNotas = document.getElementById('modal-observaciones');
    const toppingsSeleccionados = [];

    // Validación para bebidas (producto requiere_opciones)
    const selectBebida = document.getElementById('lc-producto-bebida-select');
    if (selectBebida && !selectBebida.value) {
        alert("Por favor, selecciona tu bebida de preferencia.");
        return;
    }

    // Validar opciones dinámicas para productos (requiere_opciones)

    const prod = productosCache[idProductoSeleccionado];
    const requiereOpcionesProd = !!(prod?.requiere_opciones === true || prod?.requiere_opciones === 'Y' || prod?.requiere_opciones === 'S');
    let opcionDinamicaProd = null;
    if (requiereOpcionesProd) {
        const validSel = validarSeleccionOpcionesDinamicas();
        if (!validSel.ok) {
            alert('Debes seleccionar una opción para este producto.');
            return;
        }
        opcionDinamicaProd = validSel.texto;
    }

    document.querySelectorAll('#modal-toppings-container input[type="checkbox"]:checked').forEach(function (cb) {
        toppingsSeleccionados.push(parseInt(cb.value, 10));
    });


    // 🎯 CORRECCIÓN: Leer el tamaño desde el nuevo selector de vasos visuales
    const vasoSeleccionado = document.querySelector('#lc-sizes-render-container .lc-size-option.selected');
    const idTamanio = vasoSeleccionado ? (parseInt(vasoSeleccionado.dataset.id, 10) || null) : null;
    const observacionesBase = txtNotas ? txtNotas.value : '';

    const observaciones = opcionDinamicaProd
        ? obtenerObservacionesCombinadas(observacionesBase, `Opción: ${opcionDinamicaProd}`)
        : observacionesBase;
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
                observaciones,

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
                        ${item.id_combo && item.observaciones ? `<div style="color:var(--brown-light); font-size:.85rem; margin-top:6px; white-space:pre-wrap;">Obs: ${escapeHtml(item.observaciones)}</div>` : ''}
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

function onCambioEntrega() {
    // Si se elige retiro, ocultamos datos de domicilio/barrio/dirección
    var entrega = document.getElementById('lc-cart-entrega')?.value;
    var datosCliente = document.getElementById('lc-cart-datos-cliente');
    var labelBarrio = document.getElementById('lc-label-barrio');
    var labelDireccion = document.getElementById('lc-label-direccion');

    var barrioInput = document.getElementById('lc-cart-barrio');
    var direccionInput = document.getElementById('lc-cart-direccion');
    var celularInput = document.getElementById('lc-cart-celular');

    if (!datosCliente) return;

    var esDomicilio = entrega === 'Domicilio';

    // Nombre y celular SIEMPRE
    if (celularInput) celularInput.style.display = 'block';

    // Datos domicilio solo en Domicilio
    if (barrioInput) barrioInput.style.display = esDomicilio ? 'block' : 'none';
    if (direccionInput) direccionInput.style.display = esDomicilio ? 'block' : 'none';
    if (labelBarrio) labelBarrio.style.display = esDomicilio ? 'block' : 'none';
    if (labelDireccion) labelDireccion.style.display = esDomicilio ? 'block' : 'none';

    // No guardamos nada aquí; solo validación/WhatsApp usa los inputs.
}

async function procesarPedidoWhatsApp() {
    var entrega = document.getElementById('lc-cart-entrega').value;
    var pago = document.getElementById('lc-cart-pago').value;
    var totalText = document.getElementById('lc-cart-grand-total').innerText;

    var nombre = document.getElementById('lc-cart-nombre').value;
    var barrio = document.getElementById('lc-cart-barrio')?.value || '';
    var direccion = document.getElementById('lc-cart-direccion')?.value || '';
    var celular = document.getElementById('lc-cart-celular')?.value || '';

    if (!nombre.trim()) {
        alert('⚠️ Por favor ingresa tu Nombre Completo.');
        document.getElementById('lc-cart-nombre').focus();
        return;
    }
    if (!celular.trim()) {
        alert('⚠️ Por favor ingresa tu Número de Celular.');
        document.getElementById('lc-cart-celular').focus();
        return;
    }
    if (entrega === 'Domicilio') {
        if (!barrio.trim()) {
            alert('⚠️ Por favor ingresa tu Barrio.');
            document.getElementById('lc-cart-barrio').focus();
            return;
        }
        if (!direccion.trim()) {
            alert('⚠️ Por favor ingresa tu Dirección.');
            document.getElementById('lc-cart-direccion').focus();
            return;
        }
    }

    celular = (celular || '').toString().trim();
    var subtotal = _obtenerSubtotal();
    var montoPropina = _calcularMontoPropina(subtotal);
    var totalNumerico = parseInt(totalText.replace(/[^0-9]/g, ''), 10) || 0;
    var sessionId = obtenerSessionId();

    var btnCheckout = document.querySelector('.lc-btn-checkout');
    var textoOriginalBtn = btnCheckout ? btnCheckout.innerText : '';
    if (btnCheckout) {
        btnCheckout.disabled = true;
        btnCheckout.innerText = 'Procesando...';
    }

    try {
        // 1. GUARDAR EN LA TABLA DE PEDIDOS
        const { data: nuevoPedido, error: errPedido } = await sb
            .from('pedidos')
            .insert({
                session_id: sessionId,
                tipo_entrega: entrega,
                direccion: entrega === 'Domicilio' ? direccion : null,
                metodo_pago: pago,
                total_propina: montoPropina,
                total_final: totalNumerico,
                nombre_cliente: nombre,
                celular: celular,
                barrio: entrega === 'Domicilio' ? barrio : null
            })
            .select('id_pedido, numero_pedido_diario')
            .single();

        if (errPedido || !nuevoPedido) {
            throw new Error('No se pudo registrar el pedido principal.');
        }

        const idPedidoReal = nuevoPedido.id_pedido;      // usar SIEMPRE para relaciones (pedido_detalle)
        const numeroPedido = nuevoPedido.numero_pedido_diario; // usar SOLO para mostrar al cliente/WhatsApp

        // 2. LEER ARTÍCULOS DEL CARRITO
        const { data: itemsCarrito, error: errCarrito } = await sb
            .from('carrito_items')
            .select('id_producto, id_combo, id_tamanio, cantidad, precio_unitario, observaciones')
            .eq('session_id', sessionId);

        if (!errCarrito && itemsCarrito && itemsCarrito.length > 0) {
            // 3. GUARDAR EL DETALLE EN PARALELO
            await Promise.all(itemsCarrito.map(item =>
                sb.from('pedido_detalle').insert({
                    id_pedido: idPedidoReal,
                    id_producto: item.id_producto || null,
                    id_combo: item.id_combo || null,
                    id_tamanio: item.id_tamanio || null,
                    cantidad: item.cantidad,
                    precio_unitario: item.precio_unitario,
                    observaciones: item.observaciones
                })
            ));
        }

        // 4. CONSTRUCCIÓN DEL MENSAJE
        var mensaje = `¡Hola Le Crème! 🧁 *Confirmar Pedido #${numeroPedido}*\n\n`;
        document.querySelectorAll('.lc-cart-item-card').forEach(function (item) {
            let nombreProd = item.querySelector('h4').innerText;
            let detalles = item.querySelector('.lc-cart-item-details').innerText.replace(/\n/g, ' | ');
            let precio = item.querySelector('span[style*="font-weight:700"]').innerText;
            mensaje += `▪️ ${nombreProd}\n   Detalles: ${detalles}\n   Subtotal: ${precio}\n\n`;
        });

        if (montoPropina > 0) {
            mensaje += `💝 Propina: $${montoPropina.toLocaleString('es-CO')}\n`;
        }

        mensaje += 'Entrega: ' + entrega;
        mensaje += `\nNombre Completo: ${nombre}`;
        mensaje += `\nCelular: ${celular}`;
        if (entrega === 'Domicilio') {
            mensaje += `\nBarrio: ${barrio}`;
            mensaje += '\nDirección: ' + direccion;
        }
        mensaje += '\nPago: ' + pago;
        mensaje += '\n*Total final: ' + totalText + '*';

        // 5. OBTENER EL NÚMERO DE WHATSAPP
        const { data: config } = await sb
            .from('lc_configuracion')
            .select('whatsapp_recepcion')
            .eq('id_config_tienda', 1)
            .single();

        var numWhatsApp = (config?.whatsapp_recepcion || '').replace(/\D/g, '');
        var urlWhatsApp = 'https://wa.me/' + numWhatsApp + '?text=' + encodeURIComponent(mensaje);

        // 6. MOSTRAR EL MODAL DE ÉXITO EN LA PÁGINA (Cero pestañas feas)
        mostrarModalExitoWhatsApp(urlWhatsApp, numeroPedido);

        // 7. VACIAR CARRITO
        await vaciarCarritoTrasPedido();

    } catch (err) {
        console.error(err);
        alert('❌ Error al procesar el pedido: ' + err.message);
    } finally {
        if (btnCheckout) {
            btnCheckout.disabled = false;
            btnCheckout.innerText = textoOriginalBtn || 'Confirmar Pedido 📲';
        }
    }
}

function mostrarModalExitoWhatsApp(url, numeroPedido) {
    // Si ya existe uno por si acaso, lo borramos
    const modalExistente = document.getElementById('lc-modal-success-whatsapp');
    if (modalExistente) modalExistente.remove();

    const modalHTML = `
        <div id="lc-modal-success-whatsapp" style="position:fixed; top:0; left:0; width:100%; height:100vh; background:rgba(90,58,54,0.6); display:flex; align-items:center; justify-content:center; z-index:99999; padding:20px; box-sizing:border-box; backdrop-filter:blur(4px);">
            <div style="background:#FFFFFF; max-width:400px; width:100%; border-radius:24px; padding:30px 24px; text-align:center; box-shadow:0 10px 25px rgba(0,0,0,0.1); box-sizing:border-box; border:3px solid #FFF3F5;">
                <div style="font-size: 50px; margin-bottom: 15px;">🧁</div>
                <h3 style="margin:0 0 10px 0; font-family:sans-serif; color:#5A3A36; font-size:1.4rem; font-weight:800;">¡Pedido Guardado!</h3>
                <p style="margin:0 0 20px 0; font-family:sans-serif; color:#A38A86; font-size:0.95rem; line-height:1.4;">Su pedido <strong>#${numeroPedido}</strong> se ha registrado en el sistema. Toca el botón de abajo para enviarlo directamente a nuestro WhatsApp.</p>
                
                <a href="${url}" target="_blank" onclick="document.getElementById('lc-modal-success-whatsapp').remove();" style="display:flex; align-items:center; justify-content:center; gap:10px; background:#25D366; color:#FFFFFF; text-decoration:none; padding:14px; border-radius:14px; font-family:sans-serif; font-weight:700; font-size:1rem; box-shadow:0 4px 12px rgba(37,211,102,0.3); transition:transform 0.2s;">
                    Enviar a WhatsApp 📲
                </a>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
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

function inyectarBebidaDePreferencia(prod) {
    const containerToppings = document.getElementById('modal-toppings-container');
    const toppingsBlock = document.getElementById('lc-toppings-wrapper-block');
    const tituloToppings = document.getElementById('titulo-toppings');

    if (!containerToppings || !prod) return;

    // Si el producto requiere opciones y tiene la lista llena
    if ((prod.requiere_opciones === 'S' || prod.requiere_opciones === 'Y' || prod.requiere_opciones === true) && prod.lista_opciones) {
        const listaBebidas = prod.lista_opciones
            .split(',')
            .map(b => b.trim())
            .filter(Boolean);

        if (listaBebidas.length > 0) {
            // Forzamos que el bloque de toppings se muestre (por si la categoría lo tenía oculto)
            if (toppingsBlock) toppingsBlock.style.setProperty('display', 'block', 'important');
            if (tituloToppings) {
                tituloToppings.style.setProperty('display', 'block', 'important');
                tituloToppings.innerText = 'Opciones del pedido:';
            }

            // Evitar duplicados: si ya existe el bloque dinámico, lo removemos y lo reinsertamos
            const bloquePrevio = document.getElementById('lc-bloque-bebida-dinamica');
            if (bloquePrevio) bloquePrevio.remove();

            // Extra: por seguridad, elimina cualquier select previo con el mismo id (nunca debería haber más de uno)
            document.querySelectorAll('#lc-producto-bebida-select').forEach(el => el.remove());

            const bBlock = document.createElement('div');

            bBlock.id = 'lc-bloque-bebida-dinamica';
            bBlock.style.cssText = 'margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px dashed #e0e0e0; width: 100%; text-align: left;';

            bBlock.innerHTML = `
                <label style="font-weight:700; color:#6D3B37; font-size:0.9rem; display:block; margin-bottom:6px;">
                    🥤 Escoge tu bebida de preferencia (Obligatorio):
                </label>
                <select id="lc-producto-bebida-select" class="lc-cart-select" style="width:100%; padding:8px; border-radius:8px; border:1px solid #ccc; display:block !important;">
                    <option value="">-- Selecciona una bebida --</option>
                    ${listaBebidas.map(bebida => `<option value="${bebida}">${bebida}</option>`).join('')}
                </select>
            `;

            // Lo metemos al principio del contenedor de toppings para que salga arriba
            containerToppings.prepend(bBlock);
        }
    }
}

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

function seleccionarTamañoElemento(elemento) {
    // Busca todos los vasitos en el contenedor y les quita la selección
    const opciones = elemento.parentElement.querySelectorAll('.lc-size-option');
    opciones.forEach(opt => opt.classList.remove('selected'));
    
    // Le pone la clase rosa .selected al vasito que acaban de tocar
    elemento.classList.add('selected');
    
    // Re-calcula los valores en el modal instantáneamente
    evaluarVisibilidadToppings();
    calcularTotal();
}

document.addEventListener('click', function (event) {
    let suggestionsContainer = document.getElementById('lc-search-suggestions');
    let searchInput = document.getElementById('lc-home-search');
    if (suggestionsContainer && event.target !== searchInput) {
        suggestionsContainer.style.display = 'none';
    }
});
