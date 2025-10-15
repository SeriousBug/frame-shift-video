/**
 * File picker API handlers
 */

import { FilePickerStateService } from '../file-picker-service';

export type PickerAction =
  | { type: 'toggle-folder'; path: string }
  | { type: 'toggle-file'; path: string }
  | { type: 'toggle-folder-selection'; path: string }
  | { type: 'navigate'; path: string }
  | { type: 'update-config'; config: any }
  | { type: 'search'; query: string }
  | { type: 'update-show-hidden'; showHidden: boolean }
  | { type: 'update-hide-converted'; hideConverted: boolean };

/**
 * GET /api/picker-state?key=xxx
 * Get picker state by key, or create new empty state if no key provided
 */
export async function getPickerStateHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const url = new URL(req.url);
    const key = url.searchParams.get('key');

    console.log('[SERVER] getPickerStateHandler called with key:', key);

    let state;
    let stateKey;

    if (key) {
      // Load existing state
      state = FilePickerStateService.get(key);
      if (!state) {
        return new Response(JSON.stringify({ error: 'State not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      stateKey = key;
    } else {
      // Create new empty state
      state = FilePickerStateService.createEmpty();
      stateKey = FilePickerStateService.save(state);
    }

    const response = FilePickerStateService.buildStateResponse(stateKey, state);

    console.log('[SERVER] getPickerStateHandler returning:', {
      stateKey,
      itemsCount: response.items.length,
      selectedCount: response.selectedCount,
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    console.error('Error getting picker state:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to get picker state',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
}

/**
 * POST /api/picker-action
 * Perform an action on picker state and return new state
 * Body: { key?: string, action: PickerAction }
 */
export async function pickerActionHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const body = await req.json();
    const { key, action } = body;

    console.log('[SERVER] pickerActionHandler received:', { key, action });

    if (!action || !action.type) {
      return new Response(
        JSON.stringify({ error: 'Invalid action: type is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    // Get or create state
    let state;
    if (key) {
      state = FilePickerStateService.get(key);
      if (!state) {
        return new Response(JSON.stringify({ error: 'State not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    } else {
      state = FilePickerStateService.createEmpty();
    }

    // Perform action
    let newState;
    switch (action.type) {
      case 'toggle-folder':
        if (!action.path) {
          return new Response(
            JSON.stringify({ error: 'path is required for toggle-folder' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            },
          );
        }
        newState = FilePickerStateService.toggleFolder(state, action.path);
        break;

      case 'toggle-file':
        if (!action.path) {
          return new Response(
            JSON.stringify({ error: 'path is required for toggle-file' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            },
          );
        }
        newState = FilePickerStateService.toggleFile(state, action.path);
        break;

      case 'toggle-folder-selection':
        if (!action.path) {
          return new Response(
            JSON.stringify({
              error: 'path is required for toggle-folder-selection',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            },
          );
        }
        newState = FilePickerStateService.toggleFolderSelection(
          state,
          action.path,
        );
        break;

      case 'navigate':
        if (action.path === undefined) {
          return new Response(
            JSON.stringify({ error: 'path is required for navigate' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            },
          );
        }
        newState = FilePickerStateService.navigateTo(state, action.path);
        break;

      case 'update-config':
        if (!action.config) {
          return new Response(
            JSON.stringify({ error: 'config is required for update-config' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            },
          );
        }
        newState = FilePickerStateService.updateConfig(state, action.config);
        break;

      case 'search':
        if (action.query === undefined) {
          return new Response(
            JSON.stringify({ error: 'query is required for search' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            },
          );
        }
        newState = FilePickerStateService.updateSearch(state, action.query);
        break;

      case 'update-show-hidden':
        if (action.showHidden === undefined) {
          return new Response(
            JSON.stringify({
              error: 'showHidden is required for update-show-hidden',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            },
          );
        }
        newState = FilePickerStateService.updateShowHidden(
          state,
          action.showHidden,
        );
        break;

      case 'update-hide-converted':
        if (action.hideConverted === undefined) {
          return new Response(
            JSON.stringify({
              error: 'hideConverted is required for update-hide-converted',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            },
          );
        }
        newState = FilePickerStateService.updateHideConverted(
          state,
          action.hideConverted,
        );
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action type: ${action.type}` }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        );
    }

    // Save new state and return response
    const newKey = FilePickerStateService.save(newState);
    const response = FilePickerStateService.buildStateResponse(
      newKey,
      newState,
    );

    console.log('[SERVER] pickerActionHandler returning:', {
      newKey,
      itemsCount: response.items.length,
      selectedCount: response.selectedCount,
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    console.error('Error performing picker action:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to perform picker action',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
}
