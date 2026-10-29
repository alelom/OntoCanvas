/**
 * The search box: scope, exact match, autocomplete and clearing.
 * Moved out of eventListeners.ts (#198).
 */
import { actions } from '../../state/actions';
import { debounced } from '../../utils/debounced';
import { updateSearchAutocomplete } from '../searchAutocomplete';

export function wireSearch(): void {
  document
    .querySelectorAll('input[name="searchScope"]')
    .forEach((radio) => radio.addEventListener('change', () => actions.applyFilter()));
  document
    .getElementById('searchExactMatch')
    ?.addEventListener('change', () => actions.applyFilter());

  const searchInput = document.getElementById('searchQuery');
  const searchList = document.getElementById('searchAutocomplete');
  const searchClearBtn = document.getElementById('searchClearBtn');
  if (searchInput && searchList) {
    // Escape cancels a pending update, or the suggestions would reopen after being dismissed (#93).
    const suggestionsUpdate = debounced(updateSearchAutocomplete, 150);
    searchInput.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') suggestionsUpdate.cancel();
    });
    let animationId: number | null = null;
    
    // Function to clear the search bar
    const clearSearch = () => {
      (searchInput as HTMLInputElement).value = '';
      updateSearchBarStyle();
      actions.applyFilter();
      searchInput.focus();
    };
    
    // Add click handler for clear button
    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearSearch();
      });
    }
    
    // Function to update search bar styling based on content
    const updateSearchBarStyle = () => {
      const hasText = (searchInput as HTMLInputElement).value.trim().length > 0;
      const inputEl = searchInput as HTMLElement;
      
      // Show/hide clear button
      if (searchClearBtn) {
        searchClearBtn.style.display = hasText ? 'block' : 'none';
      }
      
      if (hasText) {
        // Add more visible colored outline when search bar has text
        inputEl.style.outline = '3px solid #3498db';
        inputEl.style.outlineOffset = '2px';
        inputEl.style.borderRadius = '4px';
        // Add light yellow background to indicate active filtering
        inputEl.style.backgroundColor = '#fffacd'; // Light yellow (lemon chiffon)
        
        // Add pulsating animation - more visible with wider opacity range
        if (animationId === null) {
          let startTime: number | null = null;
          const animate = (timestamp: number) => {
            if (startTime === null) startTime = timestamp;
            const elapsed = timestamp - startTime;
            // Pulsate between 0.3 and 1.0 opacity, 1.5 second cycle (faster and more pronounced)
            const opacity = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin((elapsed / 1500) * 2 * Math.PI));
            inputEl.style.outlineColor = `rgba(52, 152, 219, ${opacity})`;
            // Also pulsate the outline width slightly for more visibility
            const widthMultiplier = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin((elapsed / 1500) * 2 * Math.PI));
            inputEl.style.outlineWidth = `${3 * widthMultiplier}px`;
            animationId = requestAnimationFrame(animate);
          };
          animationId = requestAnimationFrame(animate);
        }
      } else {
        // Remove outline, animation, and background when empty
        inputEl.style.outline = '';
        inputEl.style.outlineOffset = '';
        inputEl.style.backgroundColor = '';
        if (animationId !== null) {
          cancelAnimationFrame(animationId);
          animationId = null;
        }
      }
    };
    
    searchInput.addEventListener('input', () => {
      updateSearchBarStyle();
      actions.applyFilter();
      suggestionsUpdate.schedule();
    });
    searchInput.addEventListener('focus', () => {
      updateSearchBarStyle();
      if ((searchInput as HTMLInputElement).value.trim()) updateSearchAutocomplete();
    });
    searchInput.addEventListener('blur', () => {
      // Keep outline and animation on blur if there's text
      const hasText = (searchInput as HTMLInputElement).value.trim().length > 0;
      if (hasText) {
        updateSearchBarStyle();
      }
    });
    
    // Initial check
    updateSearchBarStyle();
  }
}
