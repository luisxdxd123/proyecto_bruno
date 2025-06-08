from flask import Flask, request, jsonify, send_file
from PIL import Image
from transformers import BlipProcessor, BlipForConditionalGeneration
import base64
import io
from gtts import gTTS
import tempfile
from flask_cors import CORS
import requests
import re
from collections import Counter
import math

app = Flask(__name__)
CORS(app)

processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base")

# Traducción usando Google Translate API gratuita vía HTTP (no requiere googletrans ni httpx)
def translate_to_spanish(text):
    try:
        url = "https://translate.googleapis.com/translate_a/single"
        params = {
            'client': 'gtx',
            'sl': 'en',
            'tl': 'es',
            'dt': 't',
            'q': text
        }
        response = requests.get(url, params=params)
        if response.status_code == 200:
            result = response.json()
            return result[0][0][0]
        else:
            return text
    except Exception:
        return text

@app.route("/describe", methods=["POST"])
def describe():
    data = request.json
    if "image_url" in data:
        response = requests.get(data["image_url"])
        image = Image.open(io.BytesIO(response.content)).convert("RGB")
    elif "image" in data:
        image_data = base64.b64decode(data["image"].split(",")[1])
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
    else:
        return jsonify({"error": "No se proporcionó imagen."}), 400

    # Descripción en inglés (más detallada)
    inputs = processor(image, return_tensors="pt")
    out = model.generate(**inputs, max_new_tokens=70)
    caption_en = processor.decode(out[0], skip_special_tokens=True)

    # Traducir al español usando la función HTTP
    caption_es = translate_to_spanish(caption_en)

    return jsonify({"description": caption_es})

@app.route("/synthesize", methods=["POST"])
def synthesize():
    data = request.json
    text = data.get("text", "")
    
    if not text:
        return jsonify({"error": "No se proporcionó texto."}), 400
    
    # Función simple de síntesis/resumen
    synthesis = create_synthesis(text)
    
    return jsonify({"synthesis": synthesis})

def create_synthesis(text):
    """
    Función sofisticada para crear un resumen/síntesis del texto usando técnicas avanzadas de NLP.
    Utiliza análisis de frecuencia, detección de palabras clave, y scoring de oraciones.
    """
    # Limpiar el texto
    text = text.strip()
    if not text:
        return "No hay texto para sintetizar."
    
    # Dividir en oraciones
    sentences = re.split(r'[.!?]+', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    
    if not sentences:
        return "No se pudieron extraer oraciones del texto."
    
    # Si el texto es muy corto, devolver tal como está
    if len(sentences) <= 2:
        return f"Síntesis: {text}"
    
    # Análisis avanzado del texto
    word_freq = calculate_word_frequency(text)
    key_phrases = extract_key_phrases(text)
    sentence_scores = score_sentences(sentences, word_freq, key_phrases)
    
    # Determinar el número de oraciones para el resumen (30-50% del original)
    target_sentences = max(2, min(len(sentences), math.ceil(len(sentences) * 0.4)))
    
    # Seleccionar las mejores oraciones manteniendo el orden original
    selected_sentences = select_best_sentences(sentences, sentence_scores, target_sentences)
    
    # Construir el resumen con conectores inteligentes
    synthesis = build_coherent_summary(selected_sentences)
    
    # Agregar prefijo y asegurar que termine correctamente
    if not synthesis.endswith('.'):
        synthesis += "."
    
    return f"Síntesis del texto: {synthesis}"

def calculate_word_frequency(text):
    """Calcula la frecuencia de palabras importantes (excluyendo stop words)."""
    # Stop words en español (palabras comunes que no aportan significado)
    stop_words = {
        'el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'es', 'se', 'no', 'te', 'lo', 'le', 'da', 'su', 'por', 'son', 'con', 'para', 'como', 'las', 'del', 'los', 'una', 'al', 'o', 'pero', 'sus', 'le', 'ha', 'me', 'si', 'sin', 'sobre', 'este', 'ya', 'entre', 'cuando', 'todo', 'esta', 'ser', 'son', 'dos', 'también', 'fue', 'había', 'sido', 'estar', 'han', 'hay', 'donde', 'porque', 'todos', 'durante', 'ellos', 'muy', 'puede', 'hasta', 'desde', 'está', 'fueron', 'van', 'sea', 'tengo', 'tiene', 'pueden', 'más', 'tras', 'otro', 'ante', 'bajo', 'según', 'mismo', 'tanto', 'menos', 'apenas', 'casi', 'mientras', 'además', 'hacia', 'dentro', 'contra', 'aún', 'así', 'luego', 'ahora', 'antes', 'después', 'entonces', 'aunque', 'solo', 'vez', 'bien', 'aquí', 'allí', 'cada', 'cual', 'quien', 'qué', 'cómo', 'cuándo', 'dónde'
    }
    
    # Extraer palabras y limpiarlas
    words = re.findall(r'\b[a-záéíóúñ]+\b', text.lower())
    
    # Filtrar stop words y palabras muy cortas
    meaningful_words = [word for word in words if word not in stop_words and len(word) > 3]
    
    # Calcular frecuencia
    word_freq = Counter(meaningful_words)
    
    # Normalizar frecuencias
    max_freq = max(word_freq.values()) if word_freq else 1
    normalized_freq = {word: freq / max_freq for word, freq in word_freq.items()}
    
    return normalized_freq

def extract_key_phrases(text):
    """Extrae frases clave y conceptos importantes del texto."""
    # Patrones para detectar frases importantes
    important_patterns = [
        r'\b(?:es importante|fundamental|clave|principal|esencial|básico|crítico)\b',
        r'\b(?:por ejemplo|como|tal como|entre otros|principalmente)\b',
        r'\b(?:resultado|conclusión|finalmente|en resumen|por tanto)\b',
        r'\b(?:problema|solución|causa|efecto|consecuencia)\b',
        r'\b(?:objetivo|meta|propósito|fin|intención)\b',
        r'\b(?:ventaja|desventaja|beneficio|riesgo|peligro)\b'
    ]
    
    key_phrases = []
    for pattern in important_patterns:
        matches = re.findall(pattern, text.lower())
        key_phrases.extend(matches)
    
    return set(key_phrases)

def score_sentences(sentences, word_freq, key_phrases):
    """Asigna puntuación a cada oración basándose en múltiples criterios."""
    scores = []
    
    for i, sentence in enumerate(sentences):
        score = 0
        sentence_lower = sentence.lower()
        words = re.findall(r'\b[a-záéíóúñ]+\b', sentence_lower)
        
        # 1. Puntuación por frecuencia de palabras importantes
        word_score = sum(word_freq.get(word, 0) for word in words)
        score += word_score * 0.3
        
        # 2. Puntuación por posición (primera y última oración son importantes)
        if i == 0:  # Primera oración
            score += 0.4
        elif i == len(sentences) - 1:  # Última oración
            score += 0.3
        
        # 3. Puntuación por longitud óptima (ni muy corta ni muy larga)
        sentence_length = len(words)
        if 8 <= sentence_length <= 25:  # Longitud óptima
            score += 0.2
        elif sentence_length < 5:  # Muy corta
            score -= 0.1
        
        # 4. Puntuación por presencia de frases clave
        phrase_bonus = sum(0.15 for phrase in key_phrases if phrase in sentence_lower)
        score += phrase_bonus
        
        # 5. Puntuación por indicadores de importancia
        importance_indicators = [
            'importante', 'fundamental', 'clave', 'principal', 'esencial',
            'resultado', 'conclusión', 'por tanto', 'en resumen',
            'objetivo', 'propósito', 'problema', 'solución'
        ]
        indicator_bonus = sum(0.1 for indicator in importance_indicators if indicator in sentence_lower)
        score += indicator_bonus
        
        # 6. Puntuación por números y datos específicos
        if re.search(r'\d+', sentence):
            score += 0.1
        
        # 7. Penalización por repetición excesiva
        if i > 0:
            similarity = calculate_similarity(sentence, sentences[i-1])
            if similarity > 0.7:  # Muy similar a la anterior
                score -= 0.2
        
        scores.append((i, score))
    
    return scores

def calculate_similarity(sent1, sent2):
    """Calcula la similitud básica entre dos oraciones."""
    words1 = set(re.findall(r'\b[a-záéíóúñ]+\b', sent1.lower()))
    words2 = set(re.findall(r'\b[a-záéíóúñ]+\b', sent2.lower()))
    
    if not words1 or not words2:
        return 0
    
    intersection = words1.intersection(words2)
    union = words1.union(words2)
    
    return len(intersection) / len(union) if union else 0

def select_best_sentences(sentences, sentence_scores, target_count):
    """Selecciona las mejores oraciones manteniendo el orden cronológico."""
    # Ordenar por puntuación (descendente)
    sorted_scores = sorted(sentence_scores, key=lambda x: x[1], reverse=True)
    
    # Seleccionar las mejores oraciones
    selected_indices = sorted([idx for idx, score in sorted_scores[:target_count]])
    
    # Devolver las oraciones en su orden original
    return [sentences[i] for i in selected_indices]

def build_coherent_summary(sentences):
    """Construye un resumen coherente añadiendo conectores cuando sea necesario."""
    if not sentences:
        return ""
    
    if len(sentences) == 1:
        return sentences[0]
    
    # Conectores para unir ideas
    connectors = [
        "Además, ", "Por otro lado, ", "Asimismo, ", "También, ",
        "En consecuencia, ", "Por tanto, ", "Finalmente, "
    ]
    
    result = [sentences[0]]  # Siempre incluir la primera sin conector
    
    for i, sentence in enumerate(sentences[1:], 1):
        # Añadir conector solo si la oración no empieza con mayúscula o conector natural
        if not re.match(r'^[A-ZÁÉÍÓÚÑ]', sentence) and not any(
            sentence.lower().startswith(conn.lower()) for conn in [
                'además', 'por otro lado', 'asimismo', 'también', 'sin embargo',
                'no obstante', 'por tanto', 'en consecuencia', 'finalmente'
            ]
        ):
            if i == len(sentences) - 1:  # Última oración
                result.append(f"Finalmente, {sentence.lower()}")
            else:
                connector = connectors[min(i-1, len(connectors)-1)]
                result.append(f"{connector}{sentence.lower()}")
        else:
            result.append(sentence)
    
    return ". ".join(result)

@app.route("/dictionary", methods=["POST"])
def dictionary():
    data = request.json
    word = data.get("word", "").strip().lower()
    
    if not word:
        return jsonify({"error": "No se proporcionó palabra."}), 400
    
    # Definir diccionario simple para 6to grado
    definition = get_simple_definition(word)
    
    return jsonify({
        "word": word,
        "definition": definition,
        "pronunciation": get_pronunciation_guide(word)
    })

def get_simple_definition(word):
    """Diccionario simple adaptado para estudiantes de 6to grado"""
    dictionary = {
        # Ciencias Naturales
        "célula": "La parte más pequeña de un ser vivo. Es como un pequeño ladrillo que forma el cuerpo.",
        "átomo": "La parte más pequeña de cualquier cosa. Todo está hecho de átomos.",
        "fotosíntesis": "El proceso donde las plantas usan la luz del sol para hacer su comida.",
        "digestión": "El proceso donde el cuerpo convierte la comida en energía.",
        "respiración": "El proceso de tomar aire para vivir.",
        "ecosistema": "Un lugar donde viven plantas y animales juntos.",
        "vertebrado": "Animal que tiene huesos en su espalda, como los humanos.",
        "invertebrado": "Animal que no tiene huesos en su espalda, como los insectos.",
        
        # Matemáticas
        "fracción": "Una parte de algo completo. Como media pizza o un cuarto de pastel.",
        "decimal": "Un número que usa punto para mostrar partes, como 3.5",
        "perímetro": "La distancia alrededor de una figura.",
        "área": "El espacio que ocupa una figura plana.",
        "volumen": "El espacio que ocupa un objeto en tres dimensiones.",
        "ángulo": "El espacio entre dos líneas que se encuentran.",
        "paralelo": "Líneas que nunca se tocan, como las vías del tren.",
        "perpendicular": "Líneas que se cruzan formando una esquina perfecta.",
        
        # Geografía
        "continente": "Una gran porción de tierra en el planeta. Hay 7 continentes.",
        "océano": "Una gran extensión de agua salada.",
        "meridiano": "Línea imaginaria que va del polo norte al polo sur.",
        "paralelo": "Línea imaginaria que rodea la Tierra de este a oeste.",
        "ecuador": "La línea que divide la Tierra en dos partes iguales.",
        "clima": "El tiempo que hace normalmente en un lugar durante el año.",
        "relieve": "Las diferentes formas del terreno: montañas, llanuras, valles.",
        
        # Historia
        "civilización": "Un grupo de personas que viven organizadas con leyes y costumbres.",
        "cultura": "La forma de vivir de un grupo de personas: su comida, música, tradiciones.",
        "independencia": "Cuando un país deja de ser gobernado por otro país.",
        "revolución": "Un gran cambio en la forma de gobernar un país.",
        "conquista": "Cuando un grupo toma control de otro lugar por la fuerza.",
        "colonia": "Un territorio controlado por otro país lejano.",
        
        # Español/Literatura
        "sustantivo": "Palabra que nombra personas, animales, cosas o lugares.",
        "adjetivo": "Palabra que describe cómo es algo o alguien.",
        "verbo": "Palabra que indica una acción o lo que hace alguien.",
        "sílaba": "Cada pedacito de sonido en que se divide una palabra.",
        "sinónimo": "Palabras que significan lo mismo o algo parecido.",
        "antónimo": "Palabras que significan lo contrario.",
        "metáfora": "Comparar dos cosas sin usar 'como'. Ejemplo: Tus ojos son estrellas.",
        "rima": "Cuando las palabras terminan con el mismo sonido.",
    }
    
    # Buscar definición
    definition = dictionary.get(word)
    
    if definition:
        return definition
    else:
        # Si no está en nuestro diccionario, dar una respuesta genérica útil
        return f"'{word}' es una palabra interesante. Te recomiendo preguntarle a tu maestro o buscar en un diccionario para aprender más sobre ella."

def get_pronunciation_guide(word):
    """Guía simple de pronunciación para palabras difíciles"""
    pronunciation_guide = {
        "fotosíntesis": "fo-to-SÍN-te-sis",
        "ecosistema": "e-co-sis-TE-ma",
        "vertebrado": "ver-te-BRA-do",
        "invertebrado": "in-ver-te-BRA-do",
        "perpendicular": "per-pen-dic-cu-LAR",
        "civilización": "ci-vi-li-za-CIÓN",
        "independencia": "in-de-pen-DEN-cia",
        "revolución": "re-vo-lu-CIÓN",
        "conquista": "con-QUIS-ta",
        "metáfora": "me-TÁ-fo-ra"
    }
    
    return pronunciation_guide.get(word, word.upper())

@app.route("/speak", methods=["POST"])
def speak():
    data = request.json
    text = data.get("text", "")
    rate = data.get("rate", 1.0)  # Velocidad de voz
    
    tts = gTTS(text, lang="es", slow=(rate < 1.0))
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
    tts.save(temp_file.name)
    temp_file.close()
    return send_file(temp_file.name, as_attachment=True, download_name="speech.mp3")

if __name__ == "__main__":
    app.run(debug=True)
