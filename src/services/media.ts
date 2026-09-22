import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Biblioteca de mídia persistente.
 *
 * REGRA: fotos/vídeos NUNCA ficam no cache (o sistema operacional apaga o cache).
 * Eles são copiados para o Diretório de Documentos e o SQLite guarda apenas os
 * METADADOS (URI + metadados da análise) — isso permite quantidades enormes de
 * imagens e vídeos sem estourar o banco.
 */

export type MediaKind = 'photo' | 'video';

function mediaDir(): Directory {
  return new Directory(Paths.document, 'kravenops-media');
}

function mediaFile(name: string): File {
  return new File(mediaDir(), name);
}

/** Extensão segura por tipo de mídia. */
function extensionFor(kind: MediaKind, sourceExtension: string): string {
  if (kind === 'photo') return sourceExtension && sourceExtension.length > 0 ? sourceExtension : '.jpg';
  return sourceExtension && sourceExtension.length > 0 ? sourceExtension : '.mp4';
}

/**
 * Copia a mídia de uma URI temporária (cache da câmera) para o armazenamento
 * permanente do app. No web, URIs base64 são mantidas como estão.
 * Retorna a URI permanente.
 */
export async function persistMedia(
  uri: string,
  kind: 'photo' | 'video',
): Promise<{ uri: string; bytes: number } | null> {
  try {
    // Web não tem expo-file-system nativo; base64 vai direto.
    if (Platform.OS === 'web') return { uri, bytes: uri.length };

    if (!uri.startsWith('file://') && !uri.startsWith('content://')) {
      return { uri, bytes: 0 };
    }

    const dir = mediaDir();
    if (!dir.exists) {
      dir.create({ idempotent: true, intermediates: true });
    }

    const src = new File(uri);
    let ext = src.extension || '';
    if (!ext.startsWith('.')) ext = `.${ext}`;
    ext = extensionFor(kind, ext);

    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const dest = mediaFile(name);
    await src.copy(dest);

    return { uri: dest.uri, bytes: dest.exists ? dest.size : 0 };
  } catch {
    // Se não conseguir copiar, mantenha a URI original (pode ser do cache, degrada graciosamente).
    return { uri, bytes: 0 };
  }
}

/** Remove um arquivo da biblioteca (se apontar para a pasta do app). */
export async function deleteMedia(uri: string): Promise<void> {
  try {
    if (!uri.startsWith(mediaDir().uri)) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // ignore
  }
}

export interface MediaStats {
  images: number;
  videos: number;
  bytes: number;
}

/** Conta imagens/vídeos e o espaço usado na biblioteca de mídia. */
export async function mediaStats(): Promise<MediaStats> {
  const stats: MediaStats = { images: 0, videos: 0, bytes: 0 };
  try {
    const dir = mediaDir();
    if (!dir.exists) return stats;
    for (const item of dir.list()) {
      if (item instanceof File) {
        const ext = item.extension.toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp', '.heic'].includes(ext)) stats.images += 1;
        else if (['.mp4', '.mov', '.m4v', '.webm'].includes(ext)) stats.videos += 1;
        stats.bytes += item.size;
      }
    }
  } catch {
    // ignore
  }
  return stats;
}

/** Apaga TODA a biblioteca de mídia (usado em Ajustes). */
export async function clearAllMedia(): Promise<void> {
  try {
    const dir = mediaDir();
    if (dir.exists) dir.delete();
  } catch {
    // ignore
  }
}