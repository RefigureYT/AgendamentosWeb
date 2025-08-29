import os
import configparser
from pathlib import Path
import fnmatch

# Tamanho máximo (em bytes) para ler o conteúdo de um arquivo. 1MB = 1 * 1024 * 1024
MAX_FILE_SIZE_TO_READ = 1_048_576 

def ler_regras_ignore(caminho_base):
    """Lê o arquivo .dirignore e retorna uma lista de padrões a serem ignorados."""
    regras = [
        '.git', '.svn', '.hg', 'venv', '.venv', 'node_modules',
        '__pycache__', '.DS_Store', '*.pyc', '*.swp',
        '*.log', '*.sql', '*.sqlite', '*.db',
        'mapa_diretorio.ini', 'mapa_conteudo.ini', 'mapa_visual.txt',
        'gerar_mapa_diretorio.py', 'gerar_mapa_diretorio_v2.py', 
        'gerar_mapa_diretorio_v3.py', 'gerar_mapas_completos.py',
        'dist', 'build', 'eggs', '*.egg-info',
        '.vscode', '.idea',
        '*.bkp', '*.bak'
    ]
    caminho_ignore = Path(caminho_base) / '.dirignore'
    if caminho_ignore.is_file():
        try:
            with open(caminho_ignore, 'r', encoding='utf-8') as f:
                regras_extras = [linha.strip() for linha in f if linha.strip() and not linha.startswith('#')]
                regras.extend(regras_extras)
                print(f"Info: Regras do .dirignore carregadas: {regras_extras}")
        except Exception as e:
            print(f"Aviso: Não foi possível ler o arquivo .dirignore: {e}")
    return list(set(regras))

def deve_ignorar(caminho, regras_ignore):
    """Verifica se um caminho (arquivo ou pasta) deve ser ignorado."""
    nome_base = os.path.basename(caminho)
    for regra in regras_ignore:
        if fnmatch.fnmatch(nome_base, regra):
            return True
    return False

def is_binary(caminho_arquivo):
    """Verifica se um arquivo parece ser binário."""
    try:
        with open(caminho_arquivo, 'rb') as f:
            chunk = f.read(1024)
            return b'\0' in chunk
    except IOError:
        return True

def gerar_arvore_visual(caminho_base, regras_ignore, prefixo=''):
    """Gera a string da árvore de diretórios de forma recursiva."""
    arvore_str = ''
    # Lista e filtra os itens do diretório
    try:
        itens = sorted(os.listdir(caminho_base))
        itens_filtrados = [item for item in itens if not deve_ignorar(item, regras_ignore)]
        ponteiros = ['├─ '] * (len(itens_filtrados) - 1) + ['└─ ']
    except OSError:
        return '' # Retorna string vazia se não puder listar o diretório

    for ponteiro, nome_item in zip(ponteiros, itens_filtrados):
        caminho_item = Path(caminho_base) / nome_item
        arvore_str += f"{prefixo}{ponteiro}{nome_item}\n"
        
        if caminho_item.is_dir():
            extensao = '│  ' if ponteiro == '├─ ' else '   '
            arvore_str += gerar_arvore_visual(caminho_item, regras_ignore, prefixo + extensao)
            
    return arvore_str

def gerar_mapas_diretorio():
    """
    Função principal que gera os três arquivos de mapa.
    """
    caminho_base = '.'
    regras_ignore = ler_regras_ignore(caminho_base)
    
    print("\nRegras de ignore ativas:", regras_ignore)

    # --- Geração dos arquivos .ini ---
    config_mapa = configparser.ConfigParser(interpolation=None)
    config_conteudo = configparser.ConfigParser(interpolation=None)
    config_mapa.optionxform = str
    config_conteudo.optionxform = str

    print("\nIniciando mapeamento para arquivos .ini...")

    for root, dirs, files in os.walk(caminho_base, topdown=True):
        dirs[:] = [d for d in dirs if not deve_ignorar(d, regras_ignore)]
        
        secao_path = Path(root).as_posix()
        
        if not config_mapa.has_section(secao_path):
            config_mapa.add_section(secao_path)
        if not config_conteudo.has_section(secao_path):
            config_conteudo.add_section(secao_path)

        for nome_arquivo in sorted(files):
            caminho_completo = Path(root) / nome_arquivo
            
            if deve_ignorar(nome_arquivo, regras_ignore):
                continue

            config_mapa.set(secao_path, nome_arquivo, '')

            try:
                tamanho_arquivo = os.path.getsize(caminho_completo)
                if tamanho_arquivo > MAX_FILE_SIZE_TO_READ:
                    config_conteudo.set(secao_path, nome_arquivo, f"<ARQUIVO MUITO GRANDE: {tamanho_arquivo / 1024:.2f} KB>")
                elif is_binary(caminho_completo):
                    config_conteudo.set(secao_path, nome_arquivo, "<ARQUIVO BINÁRIO>")
                else:
                    with open(caminho_completo, 'r', encoding='utf-8', errors='ignore') as f:
                        conteudo = f.read()
                    config_conteudo.set(secao_path, nome_arquivo, conteudo)
            except Exception as e:
                config_conteudo.set(secao_path, nome_arquivo, f"<ERRO AO LER ARQUIVO: {e}>")

    try:
        with open('mapa_diretorio.ini', 'w', encoding='utf-8') as f_mapa:
            config_mapa.write(f_mapa, space_around_delimiters=False)
        print("\n✅ Arquivo 'mapa_diretorio.ini' gerado com sucesso!")

        with open('mapa_conteudo.ini', 'w', encoding='utf-8') as f_conteudo:
            config_conteudo.write(f_conteudo, space_around_delimiters=False)
        print("✅ Arquivo 'mapa_conteudo.ini' gerado com sucesso!")
        
    except Exception as e:
        print(f"\n❌ Erro ao escrever os arquivos .ini: {e}")

    # --- Geração do arquivo de árvore visual ---
    print("\nIniciando geração do mapa visual...")
    try:
        nome_diretorio_raiz = os.path.basename(os.getcwd())
        conteudo_arvore = f"{nome_diretorio_raiz}/\n"
        conteudo_arvore += gerar_arvore_visual(caminho_base, regras_ignore)
        
        with open('mapa_visual.txt', 'w', encoding='utf-8') as f_visual:
            f_visual.write(conteudo_arvore)
        print("✅ Arquivo 'mapa_visual.txt' gerado com sucesso!")
    except Exception as e:
        print(f"\n❌ Erro ao escrever o arquivo de mapa visual: {e}")


if __name__ == "__main__":
    gerar_mapas_diretorio()
