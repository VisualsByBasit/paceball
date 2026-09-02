import { Directory, File, Paths } from 'expo-file-system';

export type StagedSessionFiles = {
  videoPath: string;
  framesDir: string;
  finalize: () => void;
  rollback: () => void;
};

const normalizeFileUri = (value: string) => {
  if (value.startsWith('file://')) {
    return value;
  }
  if (value.startsWith('/')) {
    return `file://${value}`;
  }
  throw new Error(`Paceball file path must be absolute: "${value}".`);
};

const isInside = (root: Directory, value: string) => {
  const relativePath = Paths.relative(root, normalizeFileUri(value));
  return (
    relativePath !== '' &&
    relativePath !== '..' &&
    !relativePath.startsWith('../') &&
    !relativePath.startsWith('..\\') &&
    !Paths.isAbsolute(relativePath)
  );
};

const assertInsideAppStorage = (value: string) => {
  if (!isInside(Paths.cache, value) && !isInside(Paths.document, value)) {
    throw new Error(
      `Refusing to access a path outside Paceball storage: "${value}".`,
    );
  }
};

const assertPathType = (uri: string, expectedType: 'file' | 'directory') => {
  const info = Paths.info(uri);
  if (!info.exists) {
    throw new Error(`Paceball ${expectedType} does not exist: "${uri}".`);
  }
  if ((expectedType === 'directory') !== info.isDirectory) {
    throw new Error(`Paceball ${expectedType} path has the wrong type: "${uri}".`);
  }
};

const deleteIfPresent = (uri: string, expectedType: 'file' | 'directory') => {
  const info = Paths.info(uri);
  if (!info.exists) {
    return;
  }
  if ((expectedType === 'directory') !== info.isDirectory) {
    throw new Error(`Paceball ${expectedType} path has the wrong type: "${uri}".`);
  }

  if (expectedType === 'directory') {
    new Directory(uri).delete();
  } else {
    new File(uri).delete();
  }
};

export async function stageSessionFiles(
  sessionId: string,
  videoPath: string,
  framesDir: string,
): Promise<StagedSessionFiles> {
  const sourceVideoUri = normalizeFileUri(videoPath);
  const sourceFramesUri = normalizeFileUri(framesDir);
  assertInsideAppStorage(sourceVideoUri);
  assertInsideAppStorage(sourceFramesUri);
  assertPathType(sourceVideoUri, 'file');
  assertPathType(sourceFramesUri, 'directory');

  const sessionDirectory = new Directory(
    Paths.document,
    'paceball',
    'sessions',
    sessionId,
  );
  if (sessionDirectory.exists) {
    throw new Error(`Permanent files already exist for session "${sessionId}".`);
  }

  const sourceVideo = new File(sourceVideoUri);
  const sourceFrames = new Directory(sourceFramesUri);
  const extension = sourceVideo.extension || '.mp4';
  const destinationVideo = new File(sessionDirectory, `delivery${extension}`);
  const destinationFrames = new Directory(sessionDirectory, 'frames');

  sessionDirectory.create({ intermediates: true });
  try {
    await sourceVideo.copy(destinationVideo);
    await sourceFrames.copy(destinationFrames);
  } catch (error) {
    try {
      if (sessionDirectory.exists) {
        sessionDirectory.delete();
      }
    } catch (cleanupError) {
      console.warn(
        `[Paceball files] Could not clean failed session "${sessionId}".`,
        cleanupError,
      );
    }
    throw new Error(`Could not preserve files for session "${sessionId}".`, {
      cause: error,
    });
  }

  return {
    videoPath: destinationVideo.uri,
    framesDir: destinationFrames.uri,
    finalize: () => {
      for (const [uri, type] of [
        [sourceVideoUri, 'file'],
        [sourceFramesUri, 'directory'],
      ] as const) {
        if (!isInside(Paths.cache, uri)) {
          continue;
        }
        try {
          deleteIfPresent(uri, type);
        } catch (error) {
          console.warn(
            `[Paceball files] Could not remove temporary path "${uri}".`,
            error,
          );
        }
      }
    },
    rollback: () => {
      if (sessionDirectory.exists) {
        sessionDirectory.delete();
      }
    },
  };
}

export function deleteSessionFiles(videoPath: string, framesDir: string) {
  const normalizedVideoPath = normalizeFileUri(videoPath);
  const normalizedFramesDir = normalizeFileUri(framesDir);
  assertInsideAppStorage(normalizedVideoPath);
  assertInsideAppStorage(normalizedFramesDir);

  const errors: unknown[] = [];
  for (const [uri, type] of [
    [normalizedVideoPath, 'file'],
    [normalizedFramesDir, 'directory'],
  ] as const) {
    try {
      deleteIfPresent(uri, type);
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      'Could not delete all files for the session.',
    );
  }
}
