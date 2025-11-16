// Archive page functionality

const RETENTION_DAYS = 15;

function calculateDaysRemaining(archivedAt) {
  if (!archivedAt) return RETENTION_DAYS;
  const archivedDate = new Date(archivedAt);
  const now = new Date();
  const diff = Math.ceil((archivedDate.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000 - now.getTime()) / (24 * 60 * 60 * 1000));
  return diff > 0 ? diff : 0;
}

async function loadArchive() {
  const loadingDiv = document.getElementById('loading');
  const emptyStateDiv = document.getElementById('empty-state');
  const archivedDraftsDiv = document.getElementById('archived-drafts');
  const summaryEl = document.getElementById('archive-summary');
  const errorDiv = document.getElementById('error-message');
  
  try {
    const response = await fetch('/api/archive');
    const data = await response.json();
    
    loadingDiv.classList.add('hidden');
    
    const submissions = data.submissions || [];
    
    if (submissions.length === 0) {
      summaryEl.textContent = 'No archived drafts at the moment. Archived drafts appear here for 15 days before deletion.';
      emptyStateDiv.classList.remove('hidden');
      return;
    }
    
    summaryEl.textContent = `${submissions.length} draft${submissions.length === 1 ? '' : 's'} currently kept for up to ${RETENTION_DAYS} days.`;
    
    // Render archived drafts
    submissions.forEach(draft => {
      const archivedDate = draft.archived_at ? new Date(draft.archived_at) : null;
      const daysRemaining = calculateDaysRemaining(draft.archived_at);
      
      const article = document.createElement('article');
      article.className = 'rounded-2xl border border-gray-300 bg-white px-5 py-5 shadow-sm';
      article.innerHTML = `
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 class="text-base font-semibold text-gray-900">Untitled draft</h3>
            <p class="text-xs text-gray-500">
              Archived ${archivedDate ? archivedDate.toLocaleDateString() : 'recently'} • Word count ${draft.word_count || 0}
            </p>
          </div>
          <span class="inline-flex items-center justify-center rounded-full border border-yellow-300 bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800">
            ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining
          </span>
        </div>
        <p class="mt-3 text-sm leading-relaxed text-gray-600 line-clamp-3">
          ${(draft.original_text || 'Tamil draft content').substring(0, 140)}
        </p>
      `;
      
      archivedDraftsDiv.appendChild(article);
    });
    
    archivedDraftsDiv.classList.remove('hidden');
  } catch (error) {
    console.error('Error loading archive:', error);
    loadingDiv.classList.add('hidden');
    errorDiv.textContent = 'Unable to load archived drafts. Please try again later.';
    errorDiv.classList.remove('hidden');
  }
}

// Load archive on page load
loadArchive();
