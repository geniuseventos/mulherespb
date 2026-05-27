let dadosGlobais = [];
let geojsonGlobais = null;

const tooltip = d3.select("body").append("div")
    .attr("class", "mapa-tooltip")
    .style("opacity", 0)
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("background", "rgba(10, 2, 22, 0.95)")
    .style("color", "#fff")
    .style("padding", "10px 15px")
    .style("border-radius", "8px")
    .style("font-size", "0.9rem")
    .style("box-shadow", "0 4px 10px rgba(0,0,0,0.3)")
    .style("z-index", "1000"); 

function converterExcelParaAno(numeroExcel) {
    if (!numeroExcel || isNaN(numeroExcel)) return "N/A";
    const data = new Date((numeroExcel - 25569) * 86400 * 1000);
    return data.getFullYear().toString();
}

async function iniciarDashboard() {
    try {
        const [respostaDados, respostaMapa] = await Promise.all([
            fetch('dados_dashboard.json'),
            fetch('geojs-25-mun.json')
        ]);
        
        dadosGlobais = await respostaDados.json();
        geojsonGlobais = await respostaMapa.json();
        
        atualizarPainel('todos');
        renderizarLinhaTempo();
        renderizarTiposCrime();
        renderizarFaixaEtaria();
        renderizarMapaApoio();

        document.getElementById('filtro-ano').addEventListener('change', (e) => {
            atualizarPainel(e.target.value);
        });

        window.addEventListener('resize', () => {
            const anoSelecionado = document.getElementById('filtro-ano').value;
            atualizarPainel(anoSelecionado);
            renderizarLinhaTempo();
            renderizarTiposCrime();
            renderizarFaixaEtaria();
            renderizarMapaApoio();
        });

        const menuToggle = document.getElementById('menu-toggle');
        const navContainer = document.getElementById('nav-container');
        if (menuToggle && navContainer) {
            menuToggle.addEventListener('click', () => {
                navContainer.classList.toggle('active');
            });
        }

    } catch (erro) {
        console.error("Erro crítico no script:", erro);
    }
}

const criarIdLimpo = (texto) => "ID_" + texto.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");

function atualizarPainel(anoSelecionado) {
    let dadosFiltrados = dadosGlobais;
    
    if (anoSelecionado !== 'todos') {
        dadosFiltrados = dadosGlobais.filter(item => {
            const anoDoRegistro = typeof item.MesAno === 'number' 
                ? converterExcelParaAno(item.MesAno) 
                : String(item.MesAno);
            return anoDoRegistro.includes(anoSelecionado);
        });
    }

    const contagemCidades = {};
    dadosFiltrados.forEach(item => {
        if (item.Municipio) {
            const cidade = item.Municipio;
            contagemCidades[cidade] = (contagemCidades[cidade] || 0) + item.Vitimas;
        }
    });

    renderizarRanking(contagemCidades);
    pintarMapaD3(contagemCidades);
}

function renderizarRanking(contagemCidades) {
    const container = document.getElementById('ranking-lista');
    const rankingSorted = Object.entries(contagemCidades)
        .map(([nome, total]) => ({ nome, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5); 
        
    container.innerHTML = '';
    if (rankingSorted.length === 0) return;
    
    const valorMaximo = rankingSorted[0].total;
    
    rankingSorted.forEach((cidade, i) => {
        const larguraPercentual = Math.max(5, (Math.sqrt(cidade.total) / Math.sqrt(valorMaximo)) * 100);
        const idLimpo = criarIdLimpo(cidade.nome);
        const itemDiv = document.createElement('div');
        
        itemDiv.className = 'ranking-item';
        itemDiv.id = `rank-${idLimpo}`;
        itemDiv.innerHTML = `
            <div class="ranking-barra-preenchimento" style="width: ${larguraPercentual}%;"></div>
            <div class="ranking-texto">
                <span>${i + 1}º ${cidade.nome}</span>
                <span>${cidade.total}</span>
            </div>
        `;
        
        itemDiv.addEventListener('mouseenter', () => {
            if (cidade.nome !== "NÃO INFORMADO") {
                d3.selectAll('.municipio-path').style('opacity', 0.2); 
                d3.select(`#mapa-${idLimpo}`).style('opacity', 1).attr('stroke', '#fff').attr('stroke-width', 3);
            } else { 
                d3.selectAll('.municipio-path').style('opacity', 0.2); 
            }
        });
        
        itemDiv.addEventListener('mouseleave', () => {
            d3.selectAll('.municipio-path').style('opacity', 1).attr('stroke', 'rgba(255,255,255,0.3)').attr('stroke-width', 0.5);
        });
        
        container.appendChild(itemDiv);
    });
}

function pintarMapaD3(contagemCidades) {
    const divMapa = document.getElementById('mapa-interativo');
    divMapa.innerHTML = ''; 
    
    const width = divMapa.parentElement.clientWidth || 800;
    const height = width < 600 ? 350 : 450; 
    
    const svg = d3.select("#mapa-interativo")
        .append("svg")
        .attr("width", "100%")
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`);
        
    const projection = d3.geoMercator().fitSize([width, height], geojsonGlobais);
    const pathGenerator = d3.geoPath().projection(projection);
    
    const contagemMapa = { ...contagemCidades };
    delete contagemMapa["NÃO INFORMADO"]; 
    
    const valores = Object.values(contagemMapa);
    const maxVitimas = valores.length > 0 ? Math.max(...valores) : 1;
    const minVitimas = valores.length > 0 ? Math.min(...valores.filter(v => v > 0)) : 0;
    
    const escalaCor = d3.scaleSqrt().domain([0, maxVitimas]).range(["#F8BBD0", "#880E4F"]); 
    
    const contagemNormalizada = {};
    for (const [cidade, vitimas] of Object.entries(contagemMapa)) { 
        contagemNormalizada[criarIdLimpo(cidade)] = vitimas; 
    }
    
    svg.selectAll("path")
        .data(geojsonGlobais.features)
        .enter()
        .append("path")
        .attr("class", "municipio-path")
        .attr("id", d => `mapa-${criarIdLimpo(d.properties.name)}`)
        .attr("d", pathGenerator)
        .attr("stroke", "rgba(255,255,255,0.3)")
        .attr("stroke-width", 0.5)
        .attr("fill", d => {
            const total = contagemNormalizada[criarIdLimpo(d.properties.name)] || 0;
            return total === 0 ? "#311B92" : escalaCor(total); 
        })
        .on("mouseover", function(event, d) {
            const idLimpo = criarIdLimpo(d.properties.name);
            const total = contagemNormalizada[idLimpo] || 0;
            
            d3.select(this)
                .attr("stroke", "#ffffff")
                .attr("stroke-width", 2.5)
                .attr("fill", total > 0 ? "#FF7EB3" : "#7E57C2");
                
            const itemRanking = document.getElementById(`rank-${idLimpo}`);
            if(itemRanking) { 
                itemRanking.style.transform = "scale(1.02) translateX(10px)"; 
                itemRanking.style.border = "1px solid #FF7EB3"; 
            }
            
            let xPos = event.pageX + 20;
            if (xPos + 150 > window.innerWidth) xPos = window.innerWidth - 160;

            tooltip.transition().duration(50).style("opacity", 1);
            tooltip.html(`<strong>${d.properties.name}</strong><br>Vítimas: ${total}`)
                .style("left", xPos + "px")
                .style("top", (event.pageY - 30) + "px");
        })
        .on("mousemove", function(event) { 
            let xPos = event.pageX + 20;
            if (xPos + 150 > window.innerWidth) xPos = window.innerWidth - 160;

            tooltip.style("left", xPos + "px")
                   .style("top", (event.pageY - 30) + "px"); 
        })
        .on("mouseout", function(event, d) {
            const idLimpo = criarIdLimpo(d.properties.name);
            const total = contagemNormalizada[idLimpo] || 0;
            
            d3.select(this)
                .attr("stroke", "rgba(255,255,255,0.3)")
                .attr("stroke-width", 0.5)
                .attr("fill", total === 0 ? "#311B92" : escalaCor(total));
                
            const itemRanking = document.getElementById(`rank-${idLimpo}`);
            if(itemRanking) { 
                itemRanking.style.transform = "none"; 
                itemRanking.style.border = "none"; 
            }
            
            tooltip.transition().duration(100).style("opacity", 0);
        });
        
    d3.select("#mapa-interativo").append("div")
        .attr("class", "legenda-container")
        .style("display", "flex")
        .style("align-items", "center")
        .style("justify-content", "center")
        .style("gap", "10px")
        .style("margin-top", "15px")
        .html(`
            <span>${minVitimas}</span>
            <div class="legenda-barra" style="width:150px; height:10px; background: linear-gradient(90deg, #F8BBD0, #E91E63, #880E4F); border-radius:5px;"></div>
            <span>${maxVitimas} vítimas</span>
        `);
}

function renderizarLinhaTempo() {
    const explicacoesPeriodo = {
        "2020": "Início da série histórica. A pandemia dificultou denúncias presenciais, gerando subnotificação inicial.",
        "2021": "Retomada e aumento do uso de canais digitais (como BO online e WhatsApp) encorajaram denúncias.",
        "2022": "Período de alerta. Campanhas de consciencialização fizeram com que casos antigos fossem registados.",
        "2023": "Consolidação da rede de apoio. Mulheres passam a identificar mais casos de violência psicológica.",
        "2024": "Políticas focadas em inteligência de dados começam a cobrar mais transparência nos registos.",
        "2025": "Aumento no detalhamento estatístico no interior do estado.",
        "2026": "Cenário mais atual. Foco em cruzar estes dados para ações preventivas."
    };

    const casosPorAno = {};
    const anos = ["2020", "2021", "2022", "2023", "2024", "2025", "2026"];
    anos.forEach(a => casosPorAno[a] = 0);

    dadosGlobais.forEach(item => {
        const anoRegistro = typeof item.MesAno === 'number' ? converterExcelParaAno(item.MesAno) : String(item.MesAno);
        const anoEncontrado = anos.find(a => anoRegistro.includes(a));
        if (anoEncontrado) { casosPorAno[anoEncontrado] += (item.Vitimas || 1); }
    });

    const dadosGrafico = anos.map(ano => ({ ano: ano, total: casosPorAno[ano] }));

    const container = document.getElementById('grafico-linha');
    container.innerHTML = ''; 

    const widthFull = container.clientWidth;
    const heightFull = container.clientHeight;
    const margin = {top: 50, right: 30, bottom: 40, left: 50};
    const width = widthFull - margin.left - margin.right;
    const height = heightFull - margin.top - margin.bottom;

    const svg = d3.select("#grafico-linha").append("svg").attr("width", widthFull).attr("height", heightFull).append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scalePoint().domain(anos).range([0, width]);
    const y = d3.scaleLinear().domain([0, d3.max(dadosGrafico, d => d.total) * 1.2]).range([height, 0]);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x)).style("font-size", "14px").style("color", "#ffffff").style("font-weight", "bold").select(".domain").attr("stroke", "rgba(255,255,255,0.4)"); 
    svg.append("g").call(d3.axisLeft(y).ticks(5)).style("font-size", "12px").style("color", "rgba(255,255,255,0.8)").select(".domain").attr("stroke", "none"); 

    svg.append("path").datum(dadosGrafico).attr("fill", "rgba(255, 255, 255, 0.2)").attr("stroke", "none").attr("d", d3.area().curve(d3.curveMonotoneX).x(d => x(d.ano)).y0(height).y1(d => y(d.total)));
    svg.append("path").datum(dadosGrafico).attr("fill", "none").attr("stroke", "#4A148C").attr("stroke-width", 4).attr("d", d3.line().curve(d3.curveMonotoneX).x(d => x(d.ano)).y(d => y(d.total)));

    svg.selectAll("pontos").data(dadosGrafico).enter().append("circle").attr("fill", "#ffffff").attr("stroke", "#4A148C").attr("stroke-width", 3).attr("cx", d => x(d.ano)).attr("cy", d => y(d.total)).attr("r", 7).style("cursor", "pointer")
        .on("mouseover", function(event, d) {
            d3.select(this).transition().duration(200).attr("r", 12).attr("fill", "#4A148C").attr("stroke", "#ffffff");
            tooltip.transition().duration(200).style("opacity", 1);
            let xPos = event.pageX + 15; if (xPos + 250 > window.innerWidth) xPos = window.innerWidth - 260;
            tooltip.html(`<div style="max-width: 250px; text-align: left;"><strong style="color: #FF7EB3; font-size: 1.2rem;">Ano de ${d.ano}</strong><br><strong>Total: ${d.total} vítimas</strong><hr style="border:0; border-top: 1px solid rgba(255,255,255,0.2); margin: 8px 0;"><span style="color: #ccc; font-size: 0.85rem; line-height: 1.4;">${explicacoesPeriodo[d.ano]}</span></div>`)
            .style("left", xPos + "px").style("top", (event.pageY - 50) + "px");
        })
        .on("mouseout", function() {
            d3.select(this).transition().duration(200).attr("r", 7).attr("fill", "#ffffff").attr("stroke", "#4A148C");
            tooltip.transition().duration(500).style("opacity", 0);
        });
        
    svg.selectAll("textosValores").data(dadosGrafico).enter().append("text").text(d => d.total).attr("x", d => x(d.ano)).attr("y", d => y(d.total) - 25).attr("text-anchor", "middle").style("fill", "#ffffff").style("font-weight", "800").style("font-size", "16px").style("text-shadow", "1px 1px 3px rgba(0,0,0,0.3)"); 
}

function renderizarTiposCrime() {
    const dadosCrimes = [{ crime: "Ameaça", total: 3200 }, { crime: "Lesão Corporal", total: 2850 }, { crime: "Violência Psicológica", total: 1540 }, { crime: "Estupro", total: 890 }, { crime: "Feminicídio", total: 427 }];
    dadosCrimes.sort((a, b) => a.total - b.total);

    const container = document.getElementById('grafico-tipos-crime');
    container.innerHTML = ''; 

    const margin = {top: 20, right: 40, bottom: 30, left: 140};
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;

    const svg = d3.select("#grafico-tipos-crime").append("svg").attr("width", width + margin.left + margin.right).attr("height", height + margin.top + margin.bottom).append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const y = d3.scaleBand().range([height, 0]).domain(dadosCrimes.map(d => d.crime)).padding(.2);
    svg.append("g").call(d3.axisLeft(y).tickSize(0)).style("font-size", "12px").style("font-weight", "600").style("color", "#ffffff").select(".domain").remove(); 

    const x = d3.scaleLinear().domain([0, d3.max(dadosCrimes, d => d.total) * 1.1]).range([0, width]);

    svg.selectAll("myRect").data(dadosCrimes).enter().append("rect").attr("x", x(0) ).attr("y", d => y(d.crime)).attr("width", 0).attr("height", y.bandwidth()).attr("fill", "#4A148C").attr("rx", 5).transition().duration(1000).attr("width", d => x(d.total));

    svg.selectAll("rect")
        .on("mouseover", function(event, d) {
            d3.select(this).attr("fill", "#ffffff"); 
            tooltip.transition().duration(50).style("opacity", 1);
            let xPos = event.pageX + 20; if (xPos + 150 > window.innerWidth) xPos = window.innerWidth - 160;
            tooltip.html(`<strong>${d.crime}</strong><br>Casos: ${d.total}`).style("left", xPos + "px").style("top", (event.pageY - 30) + "px");
        })
        .on("mousemove", function(event) { 
            let xPos = event.pageX + 20; if (xPos + 150 > window.innerWidth) xPos = window.innerWidth - 160;
            tooltip.style("left", xPos + "px").style("top", (event.pageY - 30) + "px"); 
        })
        .on("mouseout", function() {
            d3.select(this).attr("fill", "#4A148C"); 
            tooltip.transition().duration(100).style("opacity", 0);
        });

    svg.selectAll("textosValores").data(dadosCrimes).enter().append("text").text(d => d.total).attr("x", d => x(d.total) + 5).attr("y", d => y(d.crime) + (y.bandwidth() / 2) + 4).style("fill", "#ffffff").style("font-size", "12px").style("font-weight", "bold").style("opacity", 0).transition().delay(800).duration(500).style("opacity", 1);
}

function renderizarFaixaEtaria() {
    const dadosIdade = [{ idade: "0-17 anos", total: 850 }, { idade: "18-29 anos", total: 3800 }, { idade: "30-45 anos", total: 2900 }, { idade: "46-59 anos", total: 950 }, { idade: "60+ anos", total: 407 }];

    const container = document.getElementById('grafico-faixa-etaria');
    container.innerHTML = ''; 

    const margin = {top: 20, right: 20, bottom: 40, left: 50};
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;

    const svg = d3.select("#grafico-faixa-etaria").append("svg").attr("width", width + margin.left + margin.right).attr("height", height + margin.top + margin.bottom).append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().range([0, width]).domain(dadosIdade.map(d => d.idade)).padding(0.3);
    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).tickSize(0)).style("font-size", "11px").style("font-weight", "600").style("color", "#ffffff").select(".domain").attr("stroke", "rgba(255,255,255,0.3)"); 

    const y = d3.scaleLinear().domain([0, d3.max(dadosIdade, d => d.total) * 1.1]).range([height, 0]);
    svg.append("g").call(d3.axisLeft(y).ticks(5)).style("font-size", "11px").style("color", "rgba(255,255,255,0.7)").select(".domain").remove();

    const defs = svg.append("defs");
    const linearGradient = defs.append("linearGradient").attr("id", "gradienteRoxoReal").attr("x1", "0%").attr("y1", "0%").attr("x2", "0%").attr("y2", "100%");
    linearGradient.append("stop").attr("offset", "0%").style("stop-color", "#311B92");
    linearGradient.append("stop").attr("offset", "100%").style("stop-color", "#4A148C");

    svg.selectAll("mybar").data(dadosIdade).enter().append("rect").attr("x", d => x(d.idade)).attr("y", height).attr("width", x.bandwidth()).attr("height", 0).attr("fill", "url(#gradienteRoxoReal)").attr("rx", 5).transition().duration(1000).attr("y", d => y(d.total)).attr("height", d => height - y(d.total));

    svg.selectAll("rect")
        .on("mouseover", function(event, d) {
            d3.select(this).attr("fill", "#ffffff"); 
            tooltip.transition().duration(50).style("opacity", 1);
            let xPos = event.pageX + 20; if (xPos + 150 > window.innerWidth) xPos = window.innerWidth - 160;
            tooltip.html(`<strong>${d.idade}</strong><br>Vítimas: ${d.total}`).style("left", xPos + "px").style("top", (event.pageY - 30) + "px");
        })
        .on("mousemove", function(event) { 
            let xPos = event.pageX + 20; if (xPos + 150 > window.innerWidth) xPos = window.innerWidth - 160;
            tooltip.style("left", xPos + "px").style("top", (event.pageY - 30) + "px"); 
        })
        .on("mouseout", function() {
            d3.select(this).attr("fill", "url(#gradienteRoxoReal)"); 
            tooltip.transition().duration(100).style("opacity", 0);
        });

    svg.selectAll("textosValores").data(dadosIdade).enter().append("text").text(d => d.total).attr("x", d => x(d.idade) + (x.bandwidth() / 2)).attr("y", d => y(d.total) - 8).attr("text-anchor", "middle").style("fill", "#ffffff").style("font-size", "12px").style("font-weight", "bold").style("opacity", 0).transition().delay(800).duration(500).style("opacity", 1);
}

// =========================================================
// MAPA DA REDE DE APOIO (Apenas Mapa, 100% Largura e Click Info)
// =========================================================
// =========================================================
// MAPA DA REDE DE APOIO (Tons de Rosa + Zoom Interativo)
// =========================================================
function renderizarMapaApoio() {
    const container = document.getElementById('container-mapa-apoio');
    if (!container || !geojsonGlobais) return;
    
    container.innerHTML = ''; 

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Fundo do container em rosinha muito claro
    const svg = d3.select("#container-mapa-apoio")
        .append("svg")
        .attr("width", "100%")
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .style("background-color", "#3c1171"); 

    // Grupo g que vai conter o mapa e os ícones (necessário para o Zoom funcionar em tudo)
    const g = svg.append("g");

    const projection = d3.geoMercator().fitSize([width, height], geojsonGlobais);
    const pathGenerator = d3.geoPath().projection(projection);

    // Desenha o mapa da Paraíba em Rosa
    g.selectAll("path")
        .data(geojsonGlobais.features)
        .enter()
        .append("path")
        .attr("d", pathGenerator)
        .attr("fill", "#f082a8") // Rosa base da Paraíba
        .attr("stroke", "rgb(231, 161, 189)") // Fronteiras brancas
        .attr("stroke-width", 1.5);

    //// BASE DE DADOS COMPLETA E UNIFICADA - PONTOS DE APOIO PARAÍBA
const pontosApoio = [
    // ==========================================
    // --- POLO JOÃO PESSOA E METROPOLITANA ---
    // ==========================================
    { nome: "DEAM - João Pessoa (Centro)", tipo: "Delegacia Especializada", endereco: "Av. Dom Pedro II, 853", contato: "197", funcionamento: "24 horas", lat: -7.1150, lng: -34.8631, icone: "🚨" },
    { nome: "DEAM - João Pessoa (Sul)", tipo: "Delegacia Especializada", endereco: "Rua Valdemar Galdino", contato: "197", funcionamento: "24 horas", lat: -7.2500, lng: -34.8631, icone: "🚨" },
    { nome: "CRM Ednalva Bezerra (JP)", tipo: "Acolhimento Psicológico", endereco: "Rua Afonso Campos, 111", contato: "0800 283 3883", funcionamento: "Seg-Sex, 08h às 17h", lat: -7.1150, lng: -35.0000, icone: "🤝" },
    { nome: "NUDEM - Defensoria (JP)", tipo: "Apoio Jurídico Especializado", endereco: "Parque Solon de Lucena", contato: "(83) 99992-6286", funcionamento: "Seg-Sex, 08h às 14h", lat: -6.9800, lng: -34.8631, icone: "⚖️" },
    { nome: "Promotoria da Mulher (JP)", tipo: "Apoio Jurídico Especializado", endereco: "Rua 13 de Maio, 691", contato: "(83) 2107-6000", funcionamento: "Seg-Sex, 08h às 14h", lat: -7.1800, lng: -34.9500, icone: "⚖️" },
    { nome: "Juizado da Mulher (JP)", tipo: "Justiça / Medidas Protetivas", endereco: "Fórum Criminal - Parque Solon de Lucena", contato: "(83) 3214-3997", funcionamento: "Seg-Sex, 12h às 18h", lat: -7.1200, lng: -34.8750, icone: "⚖️" },
    { nome: "Maternidade Frei Damião (JP)", tipo: "Saúde / Referência", endereco: "Av. Alberto de Brito s/n", contato: "(83) 3215-6020", funcionamento: "Emergência 24h", lat: -7.0500, lng: -34.9500, icone: "🏥" },
    { nome: "Hospital de Trauma (JP)", tipo: "Saúde / Referência", endereco: "Av. Ouseley, s/n - Pascoal Alaggio", contato: "(83) 3216-5700", funcionamento: "Emergência 24h", lat: -7.1400, lng: -34.8400, icone: "🏥" },
    { nome: "DEAM - Santa Rita", tipo: "Delegacia Especializada", endereco: "Loteamento Jardim Mauritânia", contato: "197", funcionamento: "Seg-Sex", lat: -7.2200, lng: -34.9780, icone: "🚨" }, 
    { nome: "CRAM – Santa Rita", tipo: "Acolhimento Psicológico", endereco: "Rua Juarez Távora, s/n - Centro", contato: "(83) 3229-3755", funcionamento: "Seg-Sex, 08h às 17h", lat: -7.1500, lng: -34.9900, icone: "🤝" },
    { nome: "DEAM - Bayeux", tipo: "Delegacia Especializada", endereco: "Av. Liberdade, s/n", contato: "197", funcionamento: "Seg-Sex", lat: -7.0500, lng: -35.0800, icone: "🚨" }, 
    { nome: "CRM Maria do Bom Parto (Bayeux)", tipo: "Acolhimento Psicológico", endereco: "Av. Liberdade, 3340", contato: "(83) 3237-4322", funcionamento: "Seg-Sex, 08h às 14h", lat: -7.1000, lng: -34.9300, icone: "🤝" },
    { nome: "DEAM - Cabedelo", tipo: "Delegacia Especializada", endereco: "BR-230, Km 01", contato: "197", funcionamento: "Seg-Sex", lat: -6.8500, lng: -34.8330, icone: "🚨" },
    { nome: "CRAM Maria de Fátima (Cabedelo)", tipo: "Acolhimento Psicológico", endereco: "Rua Solon de Lucena, s/n", contato: "(83) 3250-3164", funcionamento: "Seg-Sex, 08h às 17h", lat: -6.9400, lng: -34.8400, icone: "🤝" },

    // ==========================================
    // --- POLO CAMPINA GRANDE E REGIÃO ---
    // ==========================================
    { nome: "DEAM - Campina Grande", tipo: "Delegacia Especializada", endereco: "Rua Raimundo Nonato - Catolé", contato: "197", funcionamento: "24 horas", lat: -7.2244, lng: -35.8821, icone: "🚨" },
    { nome: "CERM Fátima Lopes (CG)", tipo: "Acolhimento Psicológico", endereco: "Avenida Pedro I, 558", contato: "(83) 3310-6374", funcionamento: "Seg-Sex, 08h às 17h", lat: -7.3600, lng: -35.8821, icone: "🤝" },
    { nome: "CRAM Profa. Ana Luiza (CG)", tipo: "Acolhimento Psicológico", endereco: "Rua Capitão João Alves de Lira", contato: "(83) 3310-6000", funcionamento: "Seg-Sex, 08h às 17h", lat: -7.0900, lng: -35.8821, icone: "🤝" },
    { nome: "NUDEM - Defensoria (CG)", tipo: "Apoio Jurídico Especializado", endereco: "Rua Barão do Abiaí, 147", contato: "(83) 3310-9411", funcionamento: "Seg-Sex, 08h às 14h", lat: -7.2244, lng: -36.0200, icone: "⚖️" },
    { nome: "Juizado da Mulher (CG)", tipo: "Justiça / Medidas Protetivas", endereco: "Complexo Judiciário, Cariri", contato: "(83) 3315-3300", funcionamento: "Seg-Sex, 12h às 18h", lat: -7.2400, lng: -35.8900, icone: "⚖️" },
    { nome: "ISEA (Campina Grande)", tipo: "Saúde / Referência", endereco: "Rua Vila Nova da Rainha", contato: "(83) 3310-6085", funcionamento: "Emergência 24h", lat: -7.2244, lng: -35.7400, icone: "🏥" },
    { nome: "Hospital de Trauma (CG)", tipo: "Saúde / Referência", endereco: "Av. Floriano Peixoto, s/n", contato: "(83) 3310-9200", funcionamento: "Emergência 24h", lat: -7.2300, lng: -35.9200, icone: "🏥" },
    { nome: "DEAM - Queimadas", tipo: "Delegacia Especializada", endereco: "Rua Odilon Almeida", contato: "197", funcionamento: "Seg-Sex", lat: -7.3620, lng: -35.9000, icone: "🚨" },

    // ==========================================
    // --- POLO BREJO E VALE DO MAMANGUAPE ---
    // ==========================================
    { nome: "DEAM - Guarabira", tipo: "Delegacia Especializada", endereco: "R. Manoel F. do Nascimento", contato: "197", funcionamento: "Seg-Sex", lat: -6.8529, lng: -35.4883, icone: "🚨" },
    { nome: "CRM Directa (Guarabira)", tipo: "Acolhimento Psicológico", endereco: "Rua Solon de Lucena, 32", contato: "(83) 3271-1152", funcionamento: "Seg-Sex, 08h às 17h", lat: -6.8500, lng: -35.5300, icone: "🤝" },
    { nome: "DEAM - Alagoa Grande", tipo: "Delegacia Especializada", endereco: "Rua Enéas Cavalcante, s/n", contato: "197", funcionamento: "Seg-Sex, 08h às 18h", lat: -7.0300, lng: -35.6200, icone: "🚨" },
    { nome: "DEAM - Solânea", tipo: "Delegacia Especializada", endereco: "Rua Pernambuco, s/n", contato: "197", funcionamento: "Seg-Sex, 08h às 18h", lat: -6.7200, lng: -35.6600, icone: "🚨" },
    { nome: "DEAM - Mamanguape", tipo: "Delegacia Especializada", endereco: "BR-101, s/n", contato: "197", funcionamento: "Seg-Sex", lat: -6.8380, lng: -35.1250, icone: "🚨" },
    { nome: "DEAM - Itabaiana", tipo: "Delegacia Especializada", endereco: "Rua Projetada, s/n", contato: "197", funcionamento: "Seg-Sex, 08h às 18h", lat: -7.3200, lng: -35.3300, icone: "🚨" },

    // ==========================================
    // --- POLO PATOS, CARIRI E SERTÃO ---
    // ==========================================
    { nome: "DEAM - Patos", tipo: "Delegacia Especializada", endereco: "Rua Bossuet Wanderley, 337", contato: "197", funcionamento: "Seg-Sex, 08h às 18h", lat: -7.0244, lng: -37.2801, icone: "🚨" },
    { nome: "CRM Paula Francinete (Patos)", tipo: "Acolhimento Psicológico", endereco: "Rua Felizardo Leite, 52", contato: "(83) 3421-2605", funcionamento: "Seg-Sex, 08h às 17h", lat: -7.1400, lng: -37.2801, icone: "🤝" },
    { nome: "Mat. Dr. Peregrino Filho (Patos)", tipo: "Saúde / Referência", endereco: "Rua Dr. José Genuíno, s/n", contato: "(83) 3423-2288", funcionamento: "Emergência 24h", lat: -6.9100, lng: -37.2801, icone: "🏥" },
    { nome: "DEAM - Cajazeiras", tipo: "Delegacia Especializada", endereco: "R. Romualdo Rolim, 636", contato: "197", funcionamento: "Seg-Sex, 08h às 18h", lat: -6.8883, lng: -38.5583, icone: "🚨" },
    { nome: "CRM Susane Alves (Cajazeiras)", tipo: "Acolhimento Psicológico", endereco: "Av. Presidente João Pessoa, 160", contato: "(83) 3531-4383", funcionamento: "Seg-Sex, 08h às 17h", lat: -7.0000, lng: -38.5583, icone: "🤝" },
    { nome: "Hospital Regional de Cajazeiras", tipo: "Saúde / Referência", endereco: "Rua Juvêncio Carneiro, s/n", contato: "(83) 3531-3561", funcionamento: "Emergência 24h", lat: -6.8900, lng: -38.5700, icone: "🏥" },
    { nome: "DEAM - Sousa", tipo: "Delegacia Especializada", endereco: "R. Sardyr F. de Aragão", contato: "197", funcionamento: "Seg-Sex", lat: -6.7606, lng: -38.2259, icone: "🚨" },
    { nome: "CRAM Márcia Roberta (Sousa)", tipo: "Acolhimento Psicológico", endereco: "Rua Getúlio Vargas, Centro", contato: "(83) 3521-1052", funcionamento: "Seg-Sex, 08h às 17h", lat: -6.7600, lng: -38.2500, icone: "🤝" },
    { nome: "DEAM - Catolé do Rocha", tipo: "Delegacia Especializada", endereco: "Av. Dep. Américo Maia", contato: "197", funcionamento: "Seg-Sex, 08h às 18h", lat: -6.3400, lng: -37.7400, icone: "🚨" },
    { nome: "CRAM – Pombal", tipo: "Acolhimento Psicológico", endereco: "Rua Cel. João Leite, Centro", contato: "(83) 3431-2244", funcionamento: "Seg-Sex, 08h às 17h", lat: -6.7700, lng: -37.8000, icone: "🤝" },
    { nome: "DEAM - Princesa Isabel", tipo: "Delegacia Especializada", endereco: "Rua Ministro José Américo", contato: "197", funcionamento: "Seg-Sex, 08h às 18h", lat: -7.7400, lng: -37.9900, icone: "🚨" },
    { nome: "DEAM - Monteiro", tipo: "Delegacia Especializada", endereco: "Av. Olímpio Maia, s/n", contato: "197", funcionamento: "Seg-Sex", lat: -7.8890, lng: -37.1200, icone: "🚨" },
    { nome: "DEAM - Picuí", tipo: "Delegacia Especializada", endereco: "Rua São Sebastião, s/n", contato: "197", funcionamento: "Seg-Sex", lat: -6.5130, lng: -36.3470, icone: "🚨" }
];

    // Coloca os ícones dentro do grupo g
    g.selectAll("text.icone-mapa")
        .data(pontosApoio)
        .enter()
        .append("text")
        .attr("class", "icone-mapa")
        .attr("x", d => projection([d.lng, d.lat])[0])
        .attr("y", d => projection([d.lng, d.lat])[1])
        .text(d => d.icone)
        .attr("font-size", "24px")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .style("cursor", "pointer")
        .style("filter", "drop-shadow(2px 4px 6px rgba(0,0,0,0.3))")
        .on("mouseover", function(event, d) {
            d3.select(this).transition().duration(200).attr("font-size", "34px");
            tooltip.transition().duration(50).style("opacity", 1);
            tooltip.html(`<strong style="color: #FF7EB3;">${d.nome}</strong><br><span style="font-size: 0.8rem; color: #ddd;">Clique para detalhes</span>`)
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 30) + "px");
        })
        .on("mouseout", function() {
            d3.select(this).transition().duration(200).attr("font-size", "24px");
            tooltip.transition().duration(200).style("opacity", 0);
        })
        .on("click", function(event, d) {
            tooltip.style("opacity", 0); 
            abrirPonto(d); 
        });

    // ===============================================
    // IMPLEMENTAÇÃO DO ZOOM E PAN (Arrastar)
    // ===============================================
    const zoom = d3.zoom()
        .scaleExtent([1, 8]) // Limites de zoom: de 1x (normal) a 8x (máximo)
        .on("zoom", (event) => {
            g.attr("transform", event.transform); // Aplica o zoom/arrastar no mapa
        });

    svg.call(zoom);

    // Controles físicos na tela (+ e -)
    const zoomControls = d3.select("#container-mapa-apoio")
        .append("div")
        .style("position", "absolute")
        .style("top", "15px")
        .style("right", "15px")
        .style("display", "flex")
        .style("flex-direction", "column")
        .style("gap", "8px");

    // Botão de Maximizar
    zoomControls.append("button")
        .text("+")
        .attr("class", "btn-zoom")
        .on("click", () => { svg.transition().duration(300).call(zoom.scaleBy, 1.5); });

    // Botão de Minimizar
    zoomControls.append("button")
        .text("-")
        .attr("class", "btn-zoom")
        .on("click", () => { svg.transition().duration(300).call(zoom.scaleBy, 0.7); });

    // Botão de Reset
    zoomControls.append("button")
        .text("↺")
        .attr("title", "Resetar Mapa")
        .attr("class", "btn-zoom")
        .on("click", () => { svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity); });
}

// =========================================================
// INTERATIVIDADE DOS MODAIS (MAPA E NOTÍCIAS)
// =========================================================
const dadosNoticias = {
    'noticia-1': {
        titulo: "Sinal Vermelho Contra a Violência",
        subtitulo: "Campanha integrada com farmácias na Paraíba.",
        texto: "Criada pelo Conselho Nacional de Justiça, permite que a mulher desenhe um 'X' vermelho na palma da mão e o mostre ao atendente de farmácias cadastradas. O atendente, de forma discreta, aciona o 190."
    },
    'noticia-2': {
        titulo: "Campanha: Meu Corpo Não É Carnaval / São João",
        subtitulo: "Prevenção à importunação sexual em festividades.",
        texto: "Iniciativa que intensifica o policiamento e as estruturas de acolhimento em grandes polos festivos (como o São João de Campina Grande), garantindo canais rápidos de denúncia contra o assédio em massa."
    }
};

function abrirNoticia(id) {
    const modal = document.getElementById('noticia-modal');
    const corpo = document.getElementById('modal-dinamico-corpo');
    const info = dadosNoticias[id];

    if (info) {
        corpo.innerHTML = `
            <h3 style="font-size: 1.6rem; color: #E91E63; margin-bottom: 5px;">${info.titulo}</h3>
            <h5 style="font-size: 1rem; color: #4A148C; opacity: 0.8; margin-bottom: 20px;">${info.subtitulo}</h5>
            <p style="font-size: 1rem; line-height: 1.6; color: #333;">${info.texto}</p>
        `;
        modal.style.display = "block";
    }
}

function fecharNoticia() {
    document.getElementById('noticia-modal').style.display = "none";
}

// Função para abrir o Ponto Clicado no Mapa
function abrirPonto(info) {
    const modal = document.getElementById('ponto-modal');
    const corpo = document.getElementById('modal-ponto-corpo');

    if (modal && corpo) {
        corpo.innerHTML = `
            <h3 style="font-size: 1.6rem; color: #E91E63; margin-bottom: 5px;">${info.icone} ${info.nome}</h3>
            <h5 style="font-size: 1rem; color: #4A148C; opacity: 0.8; margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 10px;">${info.tipo}</h5>
            
            <p style="font-size: 1.05rem; color: #333; margin-bottom: 15px;">
                <strong>📍 Endereço:</strong><br> <span style="color: #555;">${info.endereco}</span>
            </p>
            <p style="font-size: 1.05rem; color: #333; margin-bottom: 15px;">
                <strong>📞 Contato:</strong><br> <span style="color: #555;">${info.contato}</span>
            </p>
            <p style="font-size: 1.05rem; color: #333; margin-bottom: 10px;">
                <strong>🕒 Funcionamento:</strong><br> <span style="color: #555;">${info.funcionamento}</span>
            </p>
        `;
        modal.style.display = "block";
    }
}

function fecharPonto() {
    document.getElementById('ponto-modal').style.display = "none";
}

// Fechar os modais clicando no fundo escuro
window.onclick = function(event) {
    const modalNoticia = document.getElementById('noticia-modal');
    const modalPonto = document.getElementById('ponto-modal');
    
    if (event.target == modalNoticia) {
        modalNoticia.style.display = "none";
    }
    if (event.target == modalPonto) {
        modalPonto.style.display = "none";
    }
}

iniciarDashboard();