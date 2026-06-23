import paper from 'paper';
import type { FeatureSnapshot, GeometryParams, PitchPoint } from '../types';
import { drawSacredOverlay } from './sacred/SacredGeometry';

const REF_RADIUS = 200;

/** Слои мандалы: один акустический параметр — один визуальный слой. */
export class MandalaRenderer {
  private rotation = 0;
  private group: paper.Group | null = null;
  private breathCircle: paper.Path.Circle | null = null;
  private style: import('../types').GeometryStyle = 'classic';

  constructor(private readonly canvas: HTMLCanvasElement) {
    paper.setup(canvas);
  }

  setStyle(style: import('../types').GeometryStyle): void {
    this.style = style;
  }

  resize(): void {
    const wrap = this.canvas.parentElement;
    if (!wrap) {
      return;
    }

    const size = Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight));
    if (size < 1) {
      return;
    }

    paper.view.viewSize = new paper.Size(size, size);
    paper.view.zoom = 1;
    paper.view.rotation = 0;
    paper.view.center = new paper.Point(size / 2, size / 2);
  }

  private layoutCenter(): paper.Point {
    const { width, height } = paper.view.viewSize;
    return new paper.Point(width / 2, height / 2);
  }

  render(params: GeometryParams, pitchTrail: PitchPoint[] = [], frozenRotation?: number): void {
    if (frozenRotation !== undefined) {
      this.rotation = frozenRotation;
    } else {
      this.rotation += params.rotationSpeed;
    }

    this.clearScene();
    const center = this.layoutCenter();
    this.group = new paper.Group();

    this.drawHarmonicRings(center, params);
    this.drawRmsRing(center, params);
    this.drawRhythmStar(center, params);
    this.drawToneRays(center, params);
    this.drawTimbrePolygon(center, params);
    drawSacredOverlay(this.group, center, params, this.style, this.rotation, (h, o) => this.strokeColor(h, o));
    this.drawVoiceMandala(center, params, pitchTrail);
    this.drawBreathRing(center, params);

    paper.view.update();
  }

  renderSnapshot(snapshot: FeatureSnapshot): void {
    this.render(snapshot.params, snapshot.pitchTrail ?? []);
  }

  renderComposite(snapshots: FeatureSnapshot[]): void {
    if (snapshots.length === 0) {
      return;
    }

    const last = snapshots[snapshots.length - 1];
    const mergedTrail = snapshots.flatMap((s) => s.pitchTrail ?? []);
    this.render(last.params, mergedTrail);
  }

  renderDual(leftParams: GeometryParams, rightParams: GeometryParams, overlap: number): void {
    this.rotation += (leftParams.rotationSpeed + rightParams.rotationSpeed) * 0.5;
    this.clearScene();
    this.group = new paper.Group();

    const center = this.layoutCenter();
    const offset = paper.view.bounds.width * 0.22;
    const scale = 0.58;
    const leftCenter = center.subtract(new paper.Point(offset, 0));
    const rightCenter = center.add(new paper.Point(offset, 0));

    const leftScaled = { ...leftParams, radius: leftParams.radius * scale };
    const rightScaled = { ...rightParams, radius: rightParams.radius * scale };

    const leftGroup = new paper.Group();
    this.drawRmsRing(leftCenter, leftScaled, leftGroup);
    this.drawToneRays(leftCenter, leftScaled, leftGroup);
    drawSacredOverlay(leftGroup, leftCenter, leftScaled, this.style, this.rotation, (h, o) => this.strokeColor(h, o));
    this.group.addChild(leftGroup);

    const rightGroup = new paper.Group();
    this.drawRmsRing(rightCenter, rightScaled, rightGroup);
    this.drawToneRays(rightCenter, rightScaled, rightGroup);
    drawSacredOverlay(rightGroup, rightCenter, rightScaled, this.style, -this.rotation, (h, o) => this.strokeColor(h, o));
    this.group.addChild(rightGroup);

    if (overlap > 0.08) {
      this.group.addChild(new paper.Path.Circle({
        center,
        radius: center.x * overlap * 0.35,
        strokeColor: this.strokeColor((leftParams.hue + rightParams.hue) * 0.5, 0.12 + overlap * 0.35),
        strokeWidth: 1 + overlap * 2,
        fillColor: this.strokeColor(leftParams.hue, overlap * 0.06),
      }));
    }

    this.drawBreathRing(center, leftParams);
    paper.view.update();
  }

  clear(): void {
    this.clearScene();
    this.rotation = 0;
    paper.view.update();
  }

  exportSvg(): string {
    return paper.project.exportSVG({ asString: true }) as string;
  }

  exportPng(): string {
    return this.canvas.toDataURL('image/png');
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  private scaleFactor(): number {
    const half = Math.min(paper.view.viewSize.width, paper.view.viewSize.height) / 2;
    return (half * 0.96) / REF_RADIUS;
  }

  private scaledRadius(params: GeometryParams): number {
    return params.radius * this.scaleFactor();
  }

  private drawRmsRing(center: paper.Point, params: GeometryParams, target?: paper.Group): void {
    const host = target ?? this.group!;
    const r = this.scaledRadius(params);
    host.addChild(new paper.Path.Circle({
      center,
      radius: r,
      strokeColor: this.strokeColor(210, params.opacity * 0.88),
      strokeWidth: this.lineWeight(0.75 + params.opacity * 0.55),
      fillColor: null,
    }));
  }

  private drawToneRays(center: paper.Point, params: GeometryParams, target?: paper.Group): void {
    const host = target ?? this.group!;
    const r = this.scaledRadius(params);

    for (let i = 0; i < params.rays; i += 1) {
      const angle = (Math.PI * 2 * i) / params.rays + params.pitchAngle + this.rotation * 0.12;
      const dir = new paper.Point(Math.cos(angle), Math.sin(angle));
      host.addChild(new paper.Path.Line({
        from: center.add(dir.multiply(r * 0.14)),
        to: center.add(dir.multiply(r * 1.04)),
        strokeColor: this.strokeColor(240 + i * 3, params.opacity * 0.72),
        strokeWidth: this.lineWeight(0.48),
        strokeCap: 'round',
      }));
    }
  }

  private drawHarmonicRings(center: paper.Point, params: GeometryParams, target?: paper.Group): void {
    const host = target ?? this.group!;
    const base = this.scaledRadius(params);

    for (let ring = 1; ring <= params.elementCount; ring += 1) {
      host.addChild(new paper.Path.Circle({
        center,
        radius: base * (0.26 + ring * 0.09),
        strokeColor: this.strokeColor(200, params.opacity * 0.38),
        strokeWidth: this.lineWeight(0.38),
        dashArray: ring % 2 === 0 ? [2, 6] : undefined,
        fillColor: null,
      }));
    }
  }

  private drawRhythmStar(center: paper.Point, params: GeometryParams, target?: paper.Group): void {
    const host = target ?? this.group!;
    const n = Math.max(params.symmetry, 3);
    const star = new paper.Path();
    const outer = this.scaledRadius(params) * 0.6;
    const inner = outer * 0.42;

    for (let i = 0; i <= n * 2; i += 1) {
      const angle = (Math.PI * i) / n + this.rotation * 0.06 - Math.PI / 2;
      const rad = i % 2 === 0 ? outer : inner;
      const point = center.add(new paper.Point(Math.cos(angle), Math.sin(angle)).multiply(rad));
      if (i === 0) {
        star.moveTo(point);
      } else {
        star.lineTo(point);
      }
    }

    star.closed = true;
    star.strokeColor = this.strokeColor(280, params.opacity * 0.52);
    star.strokeWidth = this.lineWeight(0.42);
    star.fillColor = null;
    host.addChild(star);
  }

  private drawTimbrePolygon(center: paper.Point, params: GeometryParams, target?: paper.Group): void {
    const host = target ?? this.group!;
    const sides = 3 + Math.min(Math.round(params.lineWidth), 6);
    const poly = new paper.Path();
    const r = this.scaledRadius(params) * 0.17;

    for (let i = 0; i <= sides; i += 1) {
      const angle = (Math.PI * 2 * i) / sides + this.rotation * 0.04;
      const point = center.add(new paper.Point(Math.cos(angle), Math.sin(angle)).multiply(r));
      if (i === 0) {
        poly.moveTo(point);
      } else {
        poly.lineTo(point);
      }
    }

    poly.closed = true;
    poly.strokeColor = this.strokeColor(params.hue, params.opacity * 0.62);
    poly.strokeWidth = this.lineWeight(0.42);
    poly.fillColor = this.strokeColor(params.hue, params.opacity * 0.1);
    host.addChild(poly);
  }

  private drawVoiceMandala(center: paper.Point, params: GeometryParams, segments: PitchPoint[]): void {
    if (segments.length === 0) {
      return;
    }

    const host = new paper.Group();
    const maxR = this.scaledRadius(params) * 0.98;

    segments.forEach((seg, index) => {
      this.drawVoiceMotif(host, center, seg, maxR, params.hue, index);
    });

    this.group!.addChild(host);
  }

  private drawVoiceMotif(
    host: paper.Group,
    center: paper.Point,
    seg: PitchPoint,
    maxR: number,
    baseHue: number,
    index: number,
  ): void {
    const kind = seg.kind ?? 'petal';
    switch (kind) {
      case 'ring':
        this.drawMotifRing(host, center, seg, maxR, baseHue, index);
        break;
      case 'ray':
        this.drawMotifRay(host, center, seg, maxR, baseHue, index);
        break;
      case 'arc':
        this.drawMotifArc(host, center, seg, maxR, baseHue, index);
        break;
      case 'wave':
        this.drawMotifWave(host, center, seg, maxR, baseHue, index);
        break;
      case 'dot':
        this.drawMotifDots(host, center, seg, maxR, baseHue, index);
        break;
      case 'filigree':
        this.drawMotifFiligree(host, center, seg, maxR, baseHue, index);
        break;
      case 'crescent':
        this.drawMotifCrescent(host, center, seg, maxR, baseHue, index);
        break;
      case 'chevron':
        this.drawMotifChevron(host, center, seg, maxR, baseHue, index);
        break;
      case 'lattice':
        this.drawMotifLattice(host, center, seg, maxR, baseHue, index);
        break;
      default:
        this.drawMotifPetal(host, center, seg, maxR, baseHue, index);
        break;
    }
  }

  private drawMotifPetal(
    host: paper.Group, center: paper.Point, seg: PitchPoint, maxR: number, baseHue: number, index: number,
  ): void {
    const angle = seg.angle + this.rotation * 0.03;
    const outerR = seg.radiusNorm * maxR;
    const innerR = outerR * (0.76 + seg.variant * 0.04);
    const halfW = seg.width * (0.42 + seg.variant * 0.06);
    const tip = center.add(new paper.Point(Math.cos(angle), Math.sin(angle)).multiply(outerR * 1.02));
    const left = angle - halfW;
    const right = angle + halfW;
    const leftPt = center.add(new paper.Point(Math.cos(left), Math.sin(left)).multiply(outerR * 0.92));
    const rightPt = center.add(new paper.Point(Math.cos(right), Math.sin(right)).multiply(outerR * 0.92));
    const innerPt = center.add(new paper.Point(Math.cos(angle), Math.sin(angle)).multiply(innerR));

    const petal = new paper.Path({ closed: true });
    petal.moveTo(innerPt);
    petal.lineTo(leftPt);
    petal.quadraticCurveTo(tip, rightPt);
    petal.lineTo(innerPt);

    const hue = baseHue + 22 + (index % seg.fold) * 5;
    petal.strokeColor = this.strokeColor(hue, seg.opacity * 0.78);
    petal.strokeWidth = this.lineWeight(seg.lineWidth);
    petal.fillColor = seg.variant % 2 === 0
      ? this.strokeColor(hue, seg.opacity * 0.14)
      : null;
    host.addChild(petal);
  }

  private drawMotifRing(
    host: paper.Group, center: paper.Point, seg: PitchPoint, maxR: number, baseHue: number, index: number,
  ): void {
    const r = seg.radiusNorm * maxR;
    host.addChild(new paper.Path.Circle({
      center,
      radius: r,
      strokeColor: this.strokeColor(baseHue + 12 + index, seg.opacity * 0.82),
      strokeWidth: this.lineWeight(seg.lineWidth * 0.85),
      dashArray: seg.variant % 2 === 0 ? [3, 5] : undefined,
      fillColor: null,
    }));
  }

  private drawMotifRay(
    host: paper.Group, center: paper.Point, seg: PitchPoint, maxR: number, baseHue: number, index: number,
  ): void {
    const angle = seg.angle + this.rotation * 0.04;
    const dir = new paper.Point(Math.cos(angle), Math.sin(angle));
    const inner = seg.variant === 0 ? 0.08 : 0.16;
    host.addChild(new paper.Path.Line({
      from: center.add(dir.multiply(seg.radiusNorm * maxR * inner)),
      to: center.add(dir.multiply(seg.radiusNorm * maxR * 1.02)),
      strokeColor: this.strokeColor(baseHue + 40 + index * 2, seg.opacity * 0.8),
      strokeWidth: this.lineWeight(seg.lineWidth * 0.75),
      strokeCap: 'round',
    }));
  }

  private drawMotifArc(
    host: paper.Group, center: paper.Point, seg: PitchPoint, maxR: number, baseHue: number, index: number,
  ): void {
    const angle = seg.angle + this.rotation * 0.03;
    const r = seg.radiusNorm * maxR * (0.94 + seg.variant * 0.03);
    const halfW = seg.width * 0.45;
    const arc = new paper.Path();
    const steps = 18;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const a = angle - halfW + t * halfW * 2;
      const point = center.add(new paper.Point(Math.cos(a), Math.sin(a)).multiply(r));
      if (i === 0) {
        arc.moveTo(point);
      } else {
        arc.lineTo(point);
      }
    }
    arc.strokeColor = this.strokeColor(baseHue - 8 + index, seg.opacity * 0.75);
    arc.strokeWidth = this.lineWeight(seg.lineWidth * 0.7);
    arc.strokeCap = 'round';
    host.addChild(arc);
  }

  private drawMotifWave(
    host: paper.Group, center: paper.Point, seg: PitchPoint, maxR: number, baseHue: number, index: number,
  ): void {
    const wave = new paper.Path();
    const baseAngle = seg.angle + this.rotation * 0.05;
    const amp = 0.008 + seg.variant * 0.004;
    const freq = 3 + seg.variant;

    for (let i = 0; i <= 40; i += 1) {
      const t = i / 40;
      const r = seg.radiusNorm * maxR * (0.5 + t * 0.46);
      const wobble = Math.sin(t * Math.PI * freq) * amp;
      const a = baseAngle + wobble;
      const point = center.add(new paper.Point(Math.cos(a), Math.sin(a)).multiply(r));
      if (i === 0) {
        wave.moveTo(point);
      } else {
        wave.lineTo(point);
      }
    }
    wave.strokeColor = this.strokeColor(baseHue + 55 + index, seg.opacity * 0.72);
    wave.strokeWidth = this.lineWeight(seg.lineWidth * 0.65);
    host.addChild(wave);
  }

  private drawMotifDots(
    host: paper.Group, center: paper.Point, seg: PitchPoint, maxR: number, baseHue: number, index: number,
  ): void {
    const count = Math.max(seg.fold + seg.variant, 3);
    const r = seg.radiusNorm * maxR * 0.9;
    for (let i = 0; i < count; i += 1) {
      const a = seg.angle + (Math.PI * 2 * i) / count + this.rotation * 0.025;
      host.addChild(new paper.Path.Circle({
        center: center.add(new paper.Point(Math.cos(a), Math.sin(a)).multiply(r)),
        radius: 0.85 + seg.lineWidth * 0.28,
        fillColor: this.strokeColor(baseHue + 70 + i * 10, seg.opacity * 0.72),
        strokeColor: this.strokeColor(baseHue + 70 + i * 10, seg.opacity * 0.55),
        strokeWidth: this.lineWeight(0.32),
      }));
    }
    void index;
  }

  private drawMotifFiligree(
    host: paper.Group, center: paper.Point, seg: PitchPoint, maxR: number, baseHue: number, index: number,
  ): void {
    const spiral = new paper.Path();
    const baseAngle = seg.angle + this.rotation * 0.06;
    const r0 = seg.radiusNorm * maxR * 0.72;
    const turns = 0.25 + seg.variant * 0.12;

    for (let i = 0; i <= 28; i += 1) {
      const t = i / 28;
      const a = baseAngle + t * turns * Math.PI * 2;
      const r = r0 + t * maxR * 0.14;
      const point = center.add(new paper.Point(Math.cos(a), Math.sin(a)).multiply(r));
      if (i === 0) {
        spiral.moveTo(point);
      } else {
        spiral.lineTo(point);
      }
    }
    spiral.strokeColor = this.strokeColor(baseHue + 80 + index, seg.opacity * 0.7);
    spiral.strokeWidth = this.lineWeight(0.42);
    host.addChild(spiral);
  }

  private drawMotifCrescent(
    host: paper.Group, center: paper.Point, seg: PitchPoint, maxR: number, baseHue: number, index: number,
  ): void {
    const angle = seg.angle + this.rotation * 0.04;
    const r = seg.radiusNorm * maxR * 0.88;
    const offset = r * (0.12 + seg.variant * 0.04);
    const dir = new paper.Point(Math.cos(angle), Math.sin(angle));
    const c1 = center.add(dir.multiply(r));
    const c2 = center.add(dir.multiply(r - offset));
    host.addChild(new paper.Path.Circle({
      center: c1,
      radius: r * 0.22,
      strokeColor: this.strokeColor(baseHue + 35 + index, seg.opacity * 0.72),
      strokeWidth: this.lineWeight(0.4),
      fillColor: null,
    }));
    host.addChild(new paper.Path.Circle({
      center: c2,
      radius: r * 0.19,
      strokeColor: this.strokeColor(baseHue + 35 + index, seg.opacity * 0.72),
      strokeWidth: this.lineWeight(0.4),
      fillColor: null,
    }));
  }

  private drawMotifChevron(
    host: paper.Group, center: paper.Point, seg: PitchPoint, maxR: number, baseHue: number, index: number,
  ): void {
    const angle = seg.angle + this.rotation * 0.05;
    const r = seg.radiusNorm * maxR;
    const spread = seg.width * (0.28 + seg.variant * 0.05);
    const tip = center.add(new paper.Point(Math.cos(angle), Math.sin(angle)).multiply(r * 1.02));
    const left = center.add(new paper.Point(Math.cos(angle - spread), Math.sin(angle - spread)).multiply(r * 0.72));
    const right = center.add(new paper.Point(Math.cos(angle + spread), Math.sin(angle + spread)).multiply(r * 0.72));
    const chevron = new paper.Path();
    chevron.moveTo(left);
    chevron.lineTo(tip);
    chevron.lineTo(right);
    chevron.strokeColor = this.strokeColor(baseHue + 48 + index, seg.opacity * 0.78);
    chevron.strokeWidth = this.lineWeight(seg.lineWidth * 0.72);
    chevron.strokeCap = 'round';
    chevron.strokeJoin = 'round';
    host.addChild(chevron);
  }

  private drawMotifLattice(
    host: paper.Group, center: paper.Point, seg: PitchPoint, maxR: number, baseHue: number, index: number,
  ): void {
    const r = seg.radiusNorm * maxR * 0.86;
    const a1 = seg.angle + this.rotation * 0.04;
    const a2 = a1 + Math.PI / seg.fold;
    const p1 = center.add(new paper.Point(Math.cos(a1), Math.sin(a1)).multiply(r));
    const p2 = center.add(new paper.Point(Math.cos(a2), Math.sin(a2)).multiply(r));
    const cross = new paper.Path();
    cross.moveTo(center.add(p1.subtract(center).multiply(0.55 + seg.variant * 0.08)));
    cross.lineTo(p1);
    cross.moveTo(center.add(p2.subtract(center).multiply(0.55 + seg.variant * 0.08)));
    cross.lineTo(p2);
    cross.strokeColor = this.strokeColor(baseHue + 62 + index, seg.opacity * 0.68);
    cross.strokeWidth = this.lineWeight(0.38);
    cross.strokeCap = 'round';
    host.addChild(cross);
  }

  private drawBreathRing(center: paper.Point, params: GeometryParams): void {
    if (params.breathRing <= 0.05) {
      return;
    }

    const r = this.scaledRadius(params);
    this.breathCircle = new paper.Path.Circle({
      center,
      radius: r * (1.1 + params.breathRing * 0.28),
      strokeColor: this.strokeColor(params.hue, 0.22 + params.breathRing * 0.28),
      strokeWidth: this.lineWeight(0.45),
      dashArray: [3, 7],
      fillColor: null,
    });
    this.group?.addChild(this.breathCircle);
  }

  /** Тонкая, но читаемая линия — баланс между изяществом и видимостью. */
  private lineWeight(width: number): number {
    return Math.max(width * 0.88, 0.42);
  }

  private clearScene(): void {
    this.group?.remove();
    this.breathCircle?.remove();
    this.group = null;
    this.breathCircle = null;
    paper.project.clear();
  }

  private strokeColor(hue: number, opacity: number): paper.Color {
    return new paper.Color({
      hue: hue % 360,
      saturation: 0.44,
      brightness: 0.84,
      alpha: Math.min(opacity * 1.12, 0.96),
    });
  }
}
