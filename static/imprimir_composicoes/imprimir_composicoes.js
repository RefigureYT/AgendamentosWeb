async function getTinyData(ele) {
    const idTiny = ele[1]?.getAttribute("id_tiny");
    if (!idTiny) {
        console.error("id_tiny não encontrado");
        return;
    }

    const { protocol, hostname, port } = window.location;
    const baseUrl = `${protocol}//${hostname}${port ? `:${port}` : ""}`;

    try {
        const response = await retryFetch(
            `${baseUrl}/dados-estoque/${idTiny}`,
            { mode: "cors" },
            2,
            4000
        );
        const data = await response.json();
        console.log(data);
        replaceTableData(ele, data);
    } catch (error) {
        console.error("Falha ao buscar dados Tiny:", error);
    }
}

async function retryFetch(
    url,
    options = {},
    retries = 5,
    delay = 5000
) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            if (retries > 0) {
                await new Promise((res) => setTimeout(res, delay));
                return retryFetch(url, options, retries - 1, delay);
            }
            throw new Error(`Status ${response.status}`);
        }
        return response;
    } catch (error) {
        if (retries > 0) {
            await new Promise((res) => setTimeout(res, delay));
            return retryFetch(url, options, retries - 1, delay);
        }
        throw error;
    }
}

function replaceTableData(ele, json) {
    const depositos = json.depositos;
    depositos.forEach((x) => {
        if (x.id === 785301556) ele[4].innerText = x.disponivel;
        else if (x.id === 894837591) ele[5].innerText = x.disponivel;
        else if (x.id === 894837619) ele[6].innerText = x.disponivel;
    });
}

// dispara para cada linha (pulando o cabeçalho)
Array.from($('tr')).slice(1).forEach((tr) => {
    getTinyData($(tr).children());
});

function autoResizeInput(input) {
    const mirror = input.nextElementSibling;
    mirror.textContent = input.value || "0";
    input.style.width = mirror.offsetWidth + "px";
}

window.addEventListener("load", () => {
    document
        .querySelectorAll(".input-wrapper input[type='number']")
        .forEach(autoResizeInput);

    const hoje = new Date();
    const dataFormatada =
        hoje.toLocaleDateString("pt-BR") +
        " " +
        hoje.toLocaleTimeString("pt-BR");
    const spanData = document.getElementById("data-hoje");
    if (spanData) spanData.innerText = dataFormatada;
});

// mapeamento original → curto
const HEADER_MAP = {
    'Localização': 'Loc',
    'Inferior': 'Inf',
    'Mezanino': 'Mez',
    'Caixa': 'Cx'
};

let originalHeaders = [];

// pega todos os TH do cabeçalho
const ths = Array.from(document.querySelectorAll('thead th'));

// dispara antes do diálogo de print
window.addEventListener('beforeprint', () => {
    originalHeaders = ths.map(th => th.textContent);
    ths.forEach(th => {
        const novo = HEADER_MAP[th.textContent];
        if (novo) th.textContent = novo;
    });
});

// dispara depois que o print é cancelado ou concluído
window.addEventListener('afterprint', () => {
    ths.forEach((th, i) => {
        th.textContent = originalHeaders[i];
    });
});



// async function getTinyData(ele) {
//     let id_tiny_element = ele[1].getAttribute("id_tiny")
//     let protocol = window.location.href.split(':')[0]
//     let url = `${protocol}://${window.location.hostname}:${window.location.port}`
//     console.log(await retryFetch(`${url}/dados-estoque/${id_tiny_element}`, { mode: 'cors' }, 5))
// }

// async function retryFetch(url, options = {}, retries) {
//     setTimeout(() =>
//         fetch(url, options)
//             .then((res) => {
//                 return res
//                 if (res.ok) {
//                     return res
//                 }
//                 if (retries > 0) {
//                     return retryFetch(url, options, retries - 1)
//                 }
//                 throw new Error(res.status)
//             })
//             .catch((error) => console.error(error.message)),
//         500)
// }

// function replaceTableData(ele, json) {
//     let depositos = json["depositos"]
//     let ids_depositos = [785301556, 894837591, 894837619]

//     let reservado = depositos[0]["reservado"]

//     let dep_obj = {
//         "151i": 0,
//         "151m": 0,
//         "177": 0
//     }

//     depositos.forEach((x) => {
//         if (x["id"] == 785301556) { // Depósito 151 Inferior
//             //dep_obj["151i"] = x["disponivel"]
//             ele[4].innerText = x["disponivel"]
//         } else if (x["id"] == 894837591) { // Depósito 151 Mesanino
//             //dep_obj["151m"] = x["disponivel"]
//             ele[5].innerText = x["disponivel"]
//         } else if (x["id"] == 894837619) { // Depósito 177 Cx Fechado
//             //dep_obj["177"] = x["disponivel"]
//             ele[6].innerText = x["disponivel"]
//         }
//     })
// }

// Array.from($('tr')).forEach((x, index) => {
//     if (index > 0) {
//         getTinyData($(x).children())
//     }
// })

// function autoResizeInput(input) {
//     const mirror = input.nextElementSibling;
//     mirror.textContent = input.value || "0";
//     input.style.width = mirror.offsetWidth + "px";
// }

// // Aplica ao carregar a tabela
// window.addEventListener("load", () => {
//     document.querySelectorAll(".input-wrapper input[type='number']").forEach(input => autoResizeInput(input));
// });

// window.addEventListener("load", () => {
//     const hoje = new Date();
//     const dataFormatada = hoje.toLocaleDateString('pt-BR') + ' ' + hoje.toLocaleTimeString('pt-BR');
//     const spanData = document.getElementById("data-hoje");
//     if (spanData) {
//         spanData.innerText = dataFormatada;
//     }
// });
