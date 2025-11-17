// Dashboard page functionality

async function loadDashboard() {
  const loadingDiv = document.getElementById('loading');
  const tableDiv = document.getElementById('submissions-table');
  const emptyStateDiv = document.getElementById('empty-state');
  const tbody = document.getElementById('submissions-body');
  
  try {
    const response = await fetch('/api/dashboard/stats');
    const data = await response.json();
    
    loadingDiv.classList.add('hidden');
    
    if (!data.recent_submissions || data.recent_submissions.length === 0) {
      emptyStateDiv.classList.remove('hidden');
      return;
    }
    
    // Render submissions
    data.recent_submissions.forEach(submission => {
      const row = document.createElement('tr');
      row.style.cursor = 'pointer';
      row.dataset.submissionId = submission.id;
      
      const statusClass = 
        submission.status === 'completed' ? 'bg-green-200 text-green-900' :
        submission.status === 'processing' ? 'bg-yellow-200 text-yellow-900' :
        submission.status === 'failed' ? 'bg-red-200 text-red-900' :
        'bg-gray-200 text-gray-900';
      
      row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
          <span class="text-blue-600 hover:text-blue-800 font-medium">
            ${submission.id}
          </span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${submission.word_count || 0}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${submission.model_used || 'N/A'}</td>
        <td class="px-6 py-4 whitespace-nowrap">
          <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
            ${submission.status}
          </span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
          ${new Date(submission.created_at).toLocaleDateString()}
        </td>
      `;
      
      // Add click handler to open draft in workspace
      row.addEventListener('click', (e) => {
        e.preventDefault();
        const submissionId = row.dataset.submissionId;
        // Navigate to workspace with draft ID in URL hash
        window.location.href = `/workspace#draft-${submissionId}`;
      });
      
      tbody.appendChild(row);
    });
    
    tableDiv.classList.remove('hidden');
  } catch (error) {
    console.error('Error loading dashboard:', error);
    loadingDiv.innerHTML = '<p class="text-red-600">Failed to load submissions. Please try again later.</p>';
  }
}

// Load dashboard on page load
loadDashboard();
