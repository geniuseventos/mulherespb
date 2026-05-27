const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path'); // Nova ferramenta do Node para lidar com caminhos de pastas

console.log("Iniciando a leitura de múltiplos arquivos do SINESP...");

// Aponta para a sua nova pasta
const pastaDados = './dados_brutos'; 
const arquivos = fs.readdirSync(pastaDados);

const dadosFiltrados = {};
let totalVitimasPB = 0;
let arquivosLidos = 0;

// O código agora faz um "Loop" por cada arquivo dentro da pasta
arquivos.forEach(arquivo => {
    // Garante que só vai tentar ler arquivos de Excel ou CSV
    if (arquivo.endsWith('.csv') || arquivo.endsWith('.xlsx')) {
        console.log(`Lendo arquivo: ${arquivo}...`);
        arquivosLidos++;
        
        const caminhoCompleto = path.join(pastaDados, arquivo);
        const workbook = xlsx.readFile(caminhoCompleto);
        const sheetName = workbook.SheetNames[0];
        const dadosBrutos = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        // A mesma lógica de filtro que já validamos
        dadosBrutos.forEach(linha => {
            const estado = linha['uf'];
            const vitimasFemininas = Number(linha['feminino']) || 0;
            
            if (estado === 'PB' && vitimasFemininas > 0) {
                const municipio = linha['municipio'] || "NÃO INFORMADO";
                const crime = linha['evento'] || "Crime Violento"; 
                const dataFato = linha['data_referencia']; 
                
                const chave = `${municipio}_${crime}_${dataFato}`;

                if (dadosFiltrados[chave]) {
                    dadosFiltrados[chave].Vitimas += vitimasFemininas;
                } else {
                    dadosFiltrados[chave] = {
                        Municipio: municipio,
                        Crime: crime,
                        MesAno: dataFato, 
                        Vitimas: vitimasFemininas
                    };
                }
                totalVitimasPB += vitimasFemininas;
            }
        });
    }
});

// Exporta o JSON mestre para a sua página
const resultadoFinal = Object.values(dadosFiltrados);
fs.writeFileSync('dados_dashboard.json', JSON.stringify(resultadoFinal, null, 2));

console.log(`\n✅ Processo Concluído com Sucesso!`);
console.log(`📂 Foram lidos ${arquivosLidos} arquivos na pasta 'dados_brutos'.`);
console.log(`📍 Foram encontrados ${resultadoFinal.length} agrupamentos de crimes (2020-2026).`);
console.log(`🚨 Total de vítimas do sexo feminino processadas na PB: ${totalVitimasPB.toLocaleString('pt-BR')}`);
console.log(`O seu 'dados_dashboard.json' está com a série histórica completa e pronto para uso!`);