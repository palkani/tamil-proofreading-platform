import { useMemo } from 'react';
import { diff_match_patch, DIFF_INSERT, DIFF_DELETE } from 'diff-match-patch';

interface SubmissionDiffProps {
  original: string;
  proofread: string;
}

type DiffTuple = [number, string];

const dmp = new diff_match_patch();

dmp.Diff_Timeout = 1;
dmp.Diff_EditCost = 4;

export function SubmissionDiff({ original, proofread }: SubmissionDiffProps) {
  const diff = useMemo(() => {
    const result = dmp.diff_main(original ?? '', proofread ?? '') as DiffTuple[];
    dmp.diff_cleanupSemantic(result);
    return result;
  }, [original, proofread]);

  if (!diff.length) {
    return (
      <div className="text-sm text-gray-500">No differences detected.</div>
    );
  }

  return (
    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md text-sm leading-relaxed whitespace-pre-wrap">
      {diff.map(([op, text], idx) => {
        if (!text) return null;

        switch (op) {
          case DIFF_INSERT:
            return (
              <span
                key={idx}
                className="bg-green-100 text-green-800 px-1 rounded"
              >
                {text}
              </span>
            );
          case DIFF_DELETE:
            return (
              <span
                key={idx}
                className="bg-red-100 text-red-800 line-through px-1 rounded"
              >
                {text}
              </span>
            );
          default:
            return (
              <span key={idx}>{text}</span>
            );
        }
      })}
    </div>
  );
}

export default SubmissionDiff;
