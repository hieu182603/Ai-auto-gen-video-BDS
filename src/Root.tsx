import {Composition} from 'remotion';
import './fonts';
import './satellite-texture';
import sample from '../examples/ho-tay.json';
import {dimensions, propertySchema} from './schema';
import {PropertyVideo} from './Video';
import {PropertyPoster} from './Poster';
import {OVERLAY_PREVIEW_FRAMES, OverlayPreview} from './overlay/OverlayPreview';

const property = propertySchema.parse(sample);

export const Root = () => (
  <>
    <Composition
      id="PropertyVideo"
      component={PropertyVideo}
      defaultProps={{property}}
      durationInFrames={property.video.durationSeconds * property.video.fps}
      fps={property.video.fps}
      {...dimensions(property.video.format)}
      calculateMetadata={({props}) => {
        const p = propertySchema.parse(props.property);
        return {
          ...dimensions(p.video.format),
          fps: p.video.fps,
          durationInFrames: p.video.durationSeconds * p.video.fps,
          props: {property: p},
        };
      }}
    />

    <Composition
      id="PropertyPoster"
      component={PropertyPoster}
      defaultProps={{property}}
      durationInFrames={1}
      fps={30}
      {...dimensions(property.video.format)}
      calculateMetadata={({props}) => {
        const p = propertySchema.parse(props.property);
        return {
          ...dimensions(p.video.format),
          fps: 30,
          durationInFrames: 1,
          props: {property: p},
        };
      }}
    />

    {/* Xem thử primitive geo overlay (src/overlay) — không phải video sản phẩm. */}
    <Composition id="OverlayPreview" component={OverlayPreview} durationInFrames={OVERLAY_PREVIEW_FRAMES} fps={30} width={1080} height={1920} />
  </>
);
