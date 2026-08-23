const PRIVATE_PATH_REFERENCE =
  /(?:^|[^\p{L}\p{N}])(?:\.openclaw|Obsidian)[\\/]|Glaucon[^/\\]*Vault[\\/]/iu;
const FILE_URI = /(?:^|[^\p{L}\p{N}])file:(?:\/{1,3}|\\{1,2})/iu;
const HOME_PATH = /(?:^|[^\p{L}\p{N}])~[\\/](?!\s)/u;
const WINDOWS_DRIVE_PATH =
  /(?:^|[^\p{L}\p{N}])[a-z]:[\\/](?!\s)/iu;
const WINDOWS_UNC_PATH =
  /(?:^|[^\p{L}\p{N}\\])\\\\(?=[^\\/\s])/u;
const WINDOWS_ROOTED_PATH =
  /(?:^|[^\p{L}\p{N}\\])\\(?![\\\s])/u;
const FORWARD_UNC_PATH =
  /(?:^|[^\p{L}\p{N}:\/])\/\/(?=[^\/\s])/u;
const POSIX_PATH =
  /(?:^|[^\p{L}\p{N}\/])\/(?![\/\s])/u;

export function containsAbsoluteOrPrivatePath(value: string): boolean {
  const absolutePathCandidate = value.replace(/^(?:\.\.?[\\/])+/, "");
  return (
    PRIVATE_PATH_REFERENCE.test(value) ||
    FILE_URI.test(absolutePathCandidate) ||
    HOME_PATH.test(absolutePathCandidate) ||
    WINDOWS_DRIVE_PATH.test(absolutePathCandidate) ||
    WINDOWS_UNC_PATH.test(absolutePathCandidate) ||
    WINDOWS_ROOTED_PATH.test(absolutePathCandidate) ||
    FORWARD_UNC_PATH.test(absolutePathCandidate) ||
    POSIX_PATH.test(absolutePathCandidate)
  );
}
