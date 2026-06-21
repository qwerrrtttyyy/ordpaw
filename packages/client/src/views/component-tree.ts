import { API } from '../api';
import { escapeHtml, prefersReducedMotion, debounce, throttle } from '../utils';
import { t } from '../i18n';
import { logger } from '../logger';

interface TreeNodeData {
  id: string;
  name: string;
  type: string;
  src: string;
  slot?: string;
  plugin: string;
  children: TreeNodeData[];
  parent?: string;
  metadata: Record<string, unknown>;
}

export class ComponentTreeView {
  private api: API;
  private container: HTMLElement;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private collapsedNodes = new Set<string>();
  private selectedNodeId: string | null = null;
  private searchTerm = '';
  private filterType = '';

  constructor(api: API) {
    this.api = api;
    this.container = document.createElement('div');
    this.container.className = 'component-tree-view';
  }

  async render(): Promise<void> {
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div class="view-header elegant-animate-fadeIn">
        <h2>${escapeHtml(t('components.title', '组件树'))}</h2>
        <p class="view-subtitle">${escapeHtml(t('components.subtitle', '可视化组件关系和层级结构'))}</p>
      </div>
      <div class="component-tree-toolbar">
        <div class="toolbar-left">
          <button class="elegant-btn elegant-btn-primary" id="refresh-tree-btn">
            <span class="btn-icon">↻</span>
            ${escapeHtml(t('components.refresh', '刷新'))}
          </button>
          <input type="text" class="elegant-input tree-search" id="tree-search" placeholder="${escapeHtml(t('components.search', '搜索组件...'))}">
          <select class="elegant-input tree-filter" id="tree-filter">
            <option value="">${escapeHtml(t('components.allTypes', '所有类型'))}</option>
            <option value="component">component</option>
            <option value="script">script</option>
            <option value="css">css</option>
          </select>
        </div>
        <div class="toolbar-right">
          <button class="elegant-btn elegant-btn-ghost icon-btn" id="zoom-in-btn" title="${escapeHtml(t('components.zoomIn', '放大'))}">+</button>
          <button class="elegant-btn elegant-btn-ghost icon-btn" id="zoom-out-btn" title="${escapeHtml(t('components.zoomOut', '缩小'))}">−</button>
          <button class="elegant-btn elegant-btn-ghost icon-btn" id="zoom-reset-btn" title="${escapeHtml(t('components.zoomReset', '重置'))}">⊙</button>
          <button class="elegant-btn elegant-btn-ghost icon-btn" id="expand-all-btn" title="${escapeHtml(t('components.expandAll', '展开全部'))}">⊞</button>
          <button class="elegant-btn elegant-btn-ghost icon-btn" id="collapse-all-btn" title="${escapeHtml(t('components.collapseAll', '折叠全部'))}">⊟</button>
        </div>
      </div>
      <div class="component-tree-content">
        <div class="tree-canvas-container" id="tree-canvas-container">
          <div class="tree-canvas" id="tree-canvas"></div>
          <div class="tree-legend">
            <div class="legend-item"><span class="legend-dot component"></span>component</div>
            <div class="legend-item"><span class="legend-dot script"></span>script</div>
            <div class="legend-item"><span class="legend-dot css"></span>css</div>
          </div>
        </div>
        <div class="tree-details" id="tree-details">
          <div class="details-placeholder">
            <div class="empty-icon">◈</div>
            <p>${escapeHtml(t('components.selectNode', '选择一个节点查看详情'))}</p>
          </div>
        </div>
      </div>
    `;

    this.container = content;
    this.attachEventListeners();
    await this.loadComponentTree();
  }

  private attachEventListeners() {
    this.container.querySelector('#refresh-tree-btn')?.addEventListener('click', () => {
      this.api.invalidateCache('component-');
      this.loadComponentTree();
    });

    // 使用防抖优化搜索
    const debouncedSearch = debounce((value: string) => {
      this.searchTerm = value.toLowerCase();
      this.loadComponentTree();
    }, 250);

    this.container.querySelector('#tree-search')?.addEventListener('input', (e) => {
      debouncedSearch((e.target as HTMLInputElement).value);
    });

    this.container.querySelector('#tree-filter')?.addEventListener('change', (e) => {
      this.filterType = (e.target as HTMLSelectElement).value;
      this.loadComponentTree();
    });

    this.container.querySelector('#zoom-in-btn')?.addEventListener('click', () => this.zoomBy(0.2));
    this.container
      .querySelector('#zoom-out-btn')
      ?.addEventListener('click', () => this.zoomBy(-0.2));
    this.container
      .querySelector('#zoom-reset-btn')
      ?.addEventListener('click', () => this.resetView());
    this.container
      .querySelector('#expand-all-btn')
      ?.addEventListener('click', () => this.expandAll());
    this.container
      .querySelector('#collapse-all-btn')
      ?.addEventListener('click', () => this.collapseAll());

    // 使用节流优化拖拽
    const throttledPan = throttle((x: number, y: number) => {
      this.panX = x;
      this.panY = y;
      this.applyTransform();
    }, 16);

    const canvasContainer = this.container.querySelector('#tree-canvas-container') as HTMLElement;
    if (canvasContainer) {
      canvasContainer.addEventListener('mousedown', (e) => this.onPanStart(e, throttledPan));
      canvasContainer.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    }
  }

  private onPanStart(e: MouseEvent, throttledPan: (x: number, y: number) => void) {
    if ((e.target as HTMLElement).closest('.tree-node')) return;
    this.isDragging = true;
    this.dragStartX = e.clientX - this.panX;
    this.dragStartY = e.clientY - this.panY;

    const onMove = (ev: MouseEvent) => {
      if (!this.isDragging) return;
      throttledPan(ev.clientX - this.dragStartX, ev.clientY - this.dragStartY);
    };
    const onUp = () => {
      this.isDragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    this.zoomBy(delta);
  }

  private zoomBy(delta: number) {
    this.zoom = Math.max(0.3, Math.min(3, this.zoom + delta));
    this.applyTransform();
  }

  private resetView() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.applyTransform();
  }

  private applyTransform() {
    const canvas = this.container.querySelector('#tree-canvas') as HTMLElement;
    if (canvas) {
      canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    }
  }

  private expandAll() {
    this.collapsedNodes.clear();
    this.loadComponentTree();
  }

  private collapseAll() {
    this.collapsedNodes = new Set(['__all__']);
    this.loadComponentTree();
  }

  private filterNodes(nodes: TreeNodeData[]): TreeNodeData[] {
    if (!this.searchTerm && !this.filterType) return nodes;
    return nodes.reduce<TreeNodeData[]>((acc, node) => {
      const matchesSearch = !this.searchTerm || node.name.toLowerCase().includes(this.searchTerm);
      const matchesType = !this.filterType || node.type === this.filterType;
      const filteredChildren = node.children ? this.filterNodes(node.children) : [];
      if ((matchesSearch && matchesType) || filteredChildren.length > 0) {
        acc.push({ ...node, children: filteredChildren });
      }
      return acc;
    }, []);
  }

  private async loadComponentTree() {
    try {
      const tree = (await this.api.getComponentTree()) as { root: TreeNodeData[] } | null;
      if (tree) {
        const filtered = {
          ...tree,
          root: this.filterNodes(tree.root || []),
        };
        this.renderTree(filtered);
      }
    } catch (err) {
      logger.error(err, 'Failed to load component tree');
      this.showError(t('components.loadError', '加载组件树失败'));
    }
  }

  private renderTree(tree: {
    root: TreeNodeData[];
    relationships?: Array<{ from: string; to: string }>;
  }) {
    const canvas = this.container.querySelector('#tree-canvas') as HTMLElement;
    if (!canvas) return;

    canvas.innerHTML = '';
    const svg = this.createTreeVisualization(tree);
    canvas.appendChild(svg);

    // 节点入场动画
    if (!prefersReducedMotion()) {
      const nodes = canvas.querySelectorAll('.tree-node');
      nodes.forEach((node, i) => {
        const el = node as SVGElement;
        el.style.opacity = '0';
        el.style.transform = 'scale(0.5)';
        el.style.transformOrigin = 'center';
        el.style.transition = `all 400ms cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 30}ms`;
        requestAnimationFrame(() => {
          el.style.opacity = '1';
          el.style.transform = 'scale(1)';
        });
      });

      // 路径动画
      const links = canvas.querySelectorAll('.tree-link');
      links.forEach((link, i) => {
        const path = link as unknown as SVGPathElement;
        const length = path.getTotalLength?.() || 1000;
        path.style.strokeDasharray = String(length);
        path.style.strokeDashoffset = String(length);
        path.style.transition = `stroke-dashoffset 800ms ease-out ${i * 50 + 200}ms`;
        requestAnimationFrame(() => {
          path.style.strokeDashoffset = '0';
        });
      });
    }
  }

  private createTreeVisualization(tree: {
    root: TreeNodeData[];
    relationships?: Array<{ from: string; to: string }>;
  }): SVGElement {
    const width = 1200;
    const height = 800;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('class', 'tree-svg');

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <linearGradient id="nodeGradientComponent" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
      </linearGradient>
      <linearGradient id="nodeGradientScript" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#f093fb;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#f5576c;stop-opacity:1" />
      </linearGradient>
      <linearGradient id="nodeGradientCss" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#4facfe;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#00f2fe;stop-opacity:1" />
      </linearGradient>
      <filter id="nodeShadow">
        <feGaussianBlur in="SourceAlpha" stdDeviation="4"/>
        <feOffset dx="0" dy="3" result="offsetblur"/>
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.25"/>
        </feComponentTransfer>
        <feMerge>
          <feMergeNode/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="nodeGlow">
        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    `;
    svg.appendChild(defs);

    const nodes = this.flattenTree(tree.root);
    const layout = this.calculateLayout(nodes, width, height);

    // 绘制连接线
    const linksGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    linksGroup.setAttribute('class', 'tree-links');
    for (const rel of tree.relationships || []) {
      const fromNode = layout.get(rel.from);
      const toNode = layout.get(rel.to);
      if (fromNode && toNode) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.setAttribute('d', this.createCurvedPath(fromNode, toNode));
        line.setAttribute('stroke', 'url(#nodeGradientComponent)');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('fill', 'none');
        line.setAttribute('opacity', '0.5');
        line.setAttribute('class', 'tree-link');
        linksGroup.appendChild(line);
      }
    }
    svg.appendChild(linksGroup);

    // 绘制节点
    const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    nodesGroup.setAttribute('class', 'tree-nodes');
    for (const [id, pos] of layout.entries()) {
      const node = nodes.find((n) => n.id === id);
      if (node) {
        const nodeGroup = this.createNodeElement(node, pos.x, pos.y);
        nodesGroup.appendChild(nodeGroup);
      }
    }
    svg.appendChild(nodesGroup);

    return svg;
  }

  private flattenTree(roots: TreeNodeData[]): TreeNodeData[] {
    const nodes: TreeNodeData[] = [];
    const queue: (TreeNodeData | null)[] = [...roots];
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node) continue;
      if (this.collapsedNodes.has('__all__') && roots.includes(node)) continue;
      if (this.collapsedNodes.has(node.id)) continue;
      nodes.push(node);
      if (node.children) {
        queue.push(...node.children);
      }
    }
    return nodes;
  }

  private calculateLayout(
    nodes: TreeNodeData[],
    width: number,
    height: number
  ): Map<string, { x: number; y: number }> {
    const layout = new Map<string, { x: number; y: number }>();
    const levels = new Map<number, TreeNodeData[]>();
    const nodeMap = new Map<string, TreeNodeData>();
    nodes.forEach((n) => nodeMap.set(n.id, n));

    for (const node of nodes) {
      const level = this.getLevel(node, nodeMap);
      if (!levels.has(level)) levels.set(level, []);
      levels.get(level)!.push(node);
    }

    const levelCount = levels.size || 1;
    const levelHeight = height / (levelCount + 1);
    for (const [level, levelNodes] of levels.entries()) {
      const nodeCount = levelNodes.length || 1;
      const nodeWidth = width / (nodeCount + 1);
      levelNodes.forEach((node, index) => {
        layout.set(node.id, {
          x: nodeWidth * (index + 1),
          y: levelHeight * (level + 1),
        });
      });
    }
    return layout;
  }

  private getLevel(node: TreeNodeData, nodeMap: Map<string, TreeNodeData>): number {
    let level = 0;
    let current: TreeNodeData | undefined = node;
    const visited = new Set<string>();
    while (current?.parent) {
      if (visited.has(current.id)) break;
      visited.add(current.id);
      level++;
      current = nodeMap.get(current.parent);
    }
    return level;
  }

  private createNodeElement(node: TreeNodeData, x: number, y: number): SVGElement {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'tree-node');
    group.setAttribute('data-id', node.id);
    group.style.cursor = 'pointer';

    const gradientId = `nodeGradient${node.type.charAt(0).toUpperCase() + node.type.slice(1)}`;

    // 节点矩形
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x - 70));
    rect.setAttribute('y', String(y - 22));
    rect.setAttribute('width', '140');
    rect.setAttribute('height', '44');
    rect.setAttribute('rx', '10');
    rect.setAttribute('fill', `url(#${gradientId})`);
    rect.setAttribute(
      'filter',
      this.selectedNodeId === node.id ? 'url(#nodeGlow)' : 'url(#nodeShadow)'
    );
    rect.setAttribute('class', 'node-rect');
    group.appendChild(rect);

    // 类型徽章
    const badge = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    badge.setAttribute('cx', String(x - 55));
    badge.setAttribute('cy', String(y - 8));
    badge.setAttribute('r', '4');
    badge.setAttribute('fill', 'white');
    badge.setAttribute('opacity', '0.9');
    group.appendChild(badge);

    // 节点名称
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(x - 45));
    text.setAttribute('y', String(y - 4));
    text.setAttribute('fill', 'white');
    text.setAttribute('font-size', '13');
    text.setAttribute('font-weight', '600');
    const displayName = node.name.length > 14 ? node.name.substring(0, 14) + '…' : node.name;
    text.textContent = displayName;
    group.appendChild(text);

    // 插件标签
    const plugin = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    plugin.setAttribute('x', String(x - 45));
    plugin.setAttribute('y', String(y + 12));
    plugin.setAttribute('fill', 'white');
    plugin.setAttribute('font-size', '10');
    plugin.setAttribute('opacity', '0.85');
    const pluginDisplay = node.plugin.length > 16 ? node.plugin.substring(0, 16) : node.plugin;
    plugin.textContent = pluginDisplay;
    group.appendChild(plugin);

    // 子节点数量指示
    if (node.children && node.children.length > 0) {
      const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      indicator.setAttribute('cx', String(x + 58));
      indicator.setAttribute('cy', String(y));
      indicator.setAttribute('r', '9');
      indicator.setAttribute('fill', 'white');
      indicator.setAttribute('opacity', '0.95');
      group.appendChild(indicator);

      const count = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      count.setAttribute('x', String(x + 58));
      count.setAttribute('y', String(y + 3));
      count.setAttribute('text-anchor', 'middle');
      count.setAttribute('fill', `url(#${gradientId})`);
      count.setAttribute('font-size', '10');
      count.setAttribute('font-weight', '700');
      count.textContent = String(node.children.length);
      group.appendChild(count);

      // 折叠按钮
      const collapseBtn = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      collapseBtn.setAttribute('cx', String(x + 58));
      collapseBtn.setAttribute('cy', String(y - 18));
      collapseBtn.setAttribute('r', '6');
      collapseBtn.setAttribute('fill', 'white');
      collapseBtn.setAttribute('opacity', '0.8');
      collapseBtn.style.cursor = 'pointer';
      collapseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleCollapse(node.id);
      });
      group.appendChild(collapseBtn);
    }

    // 选中状态边框
    if (this.selectedNodeId === node.id) {
      const selectedRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      selectedRect.setAttribute('x', String(x - 72));
      selectedRect.setAttribute('y', String(y - 24));
      selectedRect.setAttribute('width', '144');
      selectedRect.setAttribute('height', '48');
      selectedRect.setAttribute('rx', '12');
      selectedRect.setAttribute('fill', 'none');
      selectedRect.setAttribute('stroke', 'white');
      selectedRect.setAttribute('stroke-width', '2');
      selectedRect.setAttribute('opacity', '0.8');
      group.appendChild(selectedRect);
    }

    // 悬停效果
    group.addEventListener('mouseenter', () => {
      rect.setAttribute('transform', `scale(1.05)`);
      rect.style.transformOrigin = `${x}px ${y}px`;
    });
    group.addEventListener('mouseleave', () => {
      rect.setAttribute('transform', 'scale(1)');
    });

    group.addEventListener('click', (e) => {
      if ((e.target as SVGElement).tagName === 'circle') return;
      this.selectedNodeId = node.id;
      this.showNodeDetails(node);
      this.renderTree({ root: this.lastRoot || [], relationships: [] });
    });

    return group;
  }

  private lastRoot: TreeNodeData[] | null = null;

  private toggleCollapse(nodeId: string) {
    if (this.collapsedNodes.has(nodeId)) {
      this.collapsedNodes.delete(nodeId);
    } else {
      this.collapsedNodes.add(nodeId);
    }
    this.loadComponentTree();
  }

  private createCurvedPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
    const midY = (from.y + to.y) / 2;
    return `M ${from.x} ${from.y + 22} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y - 22}`;
  }

  private showNodeDetails(node: TreeNodeData) {
    const details = this.container.querySelector('#tree-details');
    if (!details) return;

    const childrenCount = node.children?.length || 0;
    const hasChildren = childrenCount > 0;

    details.innerHTML = `
      <div class="node-details elegant-animate-slideIn">
        <div class="node-header">
          <div class="node-type-badge type-${node.type}">${escapeHtml(node.type)}</div>
          <h3 class="node-title">${escapeHtml(node.name)}</h3>
          ${node.slot ? `<span class="node-slot-badge">${escapeHtml(node.slot)}</span>` : ''}
        </div>
        <div class="details-list">
          <div class="detail-row">
            <span class="detail-icon">⚡</span>
            <span class="detail-label">${escapeHtml(t('components.plugin', '插件'))}</span>
            <span class="detail-value">${escapeHtml(node.plugin)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-icon">📄</span>
            <span class="detail-label">${escapeHtml(t('components.source', '来源'))}</span>
            <span class="detail-value code">${escapeHtml(node.src)}</span>
          </div>
          ${
            hasChildren
              ? `
          <div class="detail-row">
            <span class="detail-icon">🔗</span>
            <span class="detail-label">${escapeHtml(t('components.children', '子组件'))}</span>
            <span class="detail-value">${childrenCount}</span>
          </div>
          `
              : ''
          }
        </div>
        ${
          hasChildren
            ? `
        <div class="children-preview">
          <h4 class="children-title">${escapeHtml(t('components.children', '子组件'))}</h4>
          <ul class="children-list">
            ${node.children
              .map(
                (c) => `
              <li class="child-item" data-child-id="${escapeHtml(c.id)}">
                <span class="child-type-dot type-${escapeHtml(c.type)}"></span>
                <span class="child-name">${escapeHtml(c.name)}</span>
              </li>
            `
              )
              .join('')}
          </ul>
        </div>
        `
            : ''
        }
        <div class="node-actions">
          <button class="elegant-btn elegant-btn-secondary" data-action="copy-id">${escapeHtml(t('common.copy', '复制 ID'))}</button>
          <button class="elegant-btn elegant-btn-secondary" data-action="copy-src">${escapeHtml(t('common.copy', '复制路径'))}</button>
        </div>
      </div>
    `;

    // 子项点击事件
    details.querySelectorAll('.child-item').forEach((el) => {
      el.addEventListener('click', () => {
        const childId = (el as HTMLElement).dataset.childId;
        if (childId) {
          this.selectedNodeId = childId;
          this.loadComponentTree();
        }
      });
    });

    // 操作按钮
    details.querySelector('[data-action="copy-id"]')?.addEventListener('click', () => {
      navigator.clipboard.writeText(node.id);
    });
    details.querySelector('[data-action="copy-src"]')?.addEventListener('click', () => {
      navigator.clipboard.writeText(node.src);
    });
  }

  private showError(message: string) {
    const canvas = this.container.querySelector('#tree-canvas') as HTMLElement;
    if (canvas) {
      canvas.innerHTML = `<div class="error-message">${escapeHtml(message)}</div>`;
    }
  }
}
