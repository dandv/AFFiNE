import type { AttachmentBlockModel } from '@blocksuite/affine/blocks';
import { CollapseIcon, ExpandIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import { debounce } from 'lodash-es';
import type { ReactElement } from 'react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { VirtuosoHandle, VirtuosoProps } from 'react-virtuoso';
import { Virtuoso } from 'react-virtuoso';

import { IconButton } from '../../ui/button';
import { Scrollable } from '../../ui/scrollbar';
import { observeResize } from '../../utils';
import * as styles from './styles.css';
import { getAttachmentBlob, renderItem } from './utils';
import type { DocInfo, MessageData, MessageDataType } from './worker/types';
import { MessageOp, MessageState, RenderKind, State } from './worker/types';

type ItemProps = VirtuosoProps<null, undefined>;

const Page = React.memo(
  ({
    width,
    height,
    className,
  }: {
    index: number;
    width: number;
    height: number;
    className: string;
  }) => {
    return (
      <div
        className={className}
        style={{ width: `${width}px`, height: `${height}px` }}
      ></div>
    );
  }
);

Page.displayName = 'viewer-page';

const THUMBNAIL_WIDTH = 94;

const Thumbnail = React.memo(
  ({
    index,
    width,
    height,
    className,
    onSelect,
  }: {
    index: number;
    width: number;
    height: number;
    className: string;
    onSelect: (index: number) => void;
  }) => {
    return (
      <div
        className={className}
        style={{ width: `${width}px`, height: `${height}px` }}
        onClick={() => onSelect(index)}
      ></div>
    );
  }
);

Thumbnail.displayName = 'viewer-thumbnail';

const Scroller = React.forwardRef<HTMLDivElement, ItemProps>(
  ({ ...props }, ref) => {
    return (
      <Scrollable.Root>
        <Scrollable.Viewport ref={ref} {...props} />
        <Scrollable.Scrollbar />
      </Scrollable.Root>
    );
  }
);

Scroller.displayName = 'viewer-scroller';

const Item = React.forwardRef<HTMLDivElement, ItemProps>(
  ({ ...props }, ref) => {
    return <div ref={ref} {...props} />;
  }
);

Item.displayName = 'viewer-item';

interface ViewerProps {
  model: AttachmentBlockModel;
}

export const Viewer = ({ model }: ViewerProps): ReactElement => {
  const [state, setState] = useState(State.Connecting);
  const [viewportInfo, setViewportInfo] = useState({
    dpi: window.devicePixelRatio,
    width: 1,
    height: 1,
  });
  const [docInfo, setDocInfo] = useState<DocInfo>({
    cursor: 0,
    total: 0,
    width: 1,
    height: 1,
  });
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const scrollerHandleRef = useRef<VirtuosoHandle | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const [mainVisibleRange, setMainVisibleRange] = useState({
    startIndex: 0,
    endIndex: 0,
  });

  const [collapsed, setCollapsed] = useState(true);
  const thumbnailsScrollerHandleRef = useRef<VirtuosoHandle | null>(null);
  const thumbnailsScrollerRef = useRef<HTMLElement | null>(null);
  const [thumbnailsVisibleRange, setThumbnailsVisibleRange] = useState({
    startIndex: 0,
    endIndex: 0,
  });

  const post = useCallback(
    <T extends MessageOp>(type: T, data?: MessageDataType[T]) => {
      workerRef.current?.postMessage({
        type,
        [type]: data,
        state: MessageState.Poll,
      });
    },
    [workerRef]
  );

  const render = useCallback(
    (id: number, kind: RenderKind, imageBitmap: ImageBitmap) => {
      renderItem(
        (kind === RenderKind.Page ? scrollerRef : thumbnailsScrollerRef)
          .current,
        id,
        imageBitmap
      );
    },
    [scrollerRef, thumbnailsScrollerRef]
  );

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const { scrollTop, scrollHeight } = el;

    setDocInfo(info => {
      const cursor = Math.min(
        Math.ceil(scrollTop / (scrollHeight / info.total)),
        info.total - 1
      );
      // thumbnailsScrollerHandleRef.current?.scrollToIndex(cursor)
      return {
        ...info,
        cursor,
      };
    });
    // }, [scrollerRef, thumbnailsScrollerHandleRef]);
  }, [scrollerRef]);

  const onSelect = useCallback(
    (index: number) => {
      scrollerHandleRef.current?.scrollToIndex(index);
      setDocInfo(info => ({ ...info, cursor: index }));
    },
    [scrollerHandleRef]
  );

  const updateMainVisibleRange = useMemo(
    () => debounce(setMainVisibleRange, 233, { trailing: true }),
    [setMainVisibleRange]
  );

  const updateThumbnailsVisibleRange = useMemo(
    () => debounce(setThumbnailsVisibleRange, 233, { trailing: true }),
    [setThumbnailsVisibleRange]
  );

  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;

    return observeResize(el, entry => {
      const rect = entry.contentRect;
      setViewportInfo(info => ({
        ...info,
        width: rect.width,
        height: rect.height,
      }));
    });
  }, [viewerRef]);

  useEffect(() => {
    post(MessageOp.SyncViewportInfo, viewportInfo);
  }, [viewportInfo, post]);

  useEffect(() => {
    const { startIndex, endIndex } = mainVisibleRange;
    let index = startIndex;
    for (; index <= endIndex; index++) {
      post(MessageOp.Render, { index, kind: RenderKind.Page });
    }
  }, [mainVisibleRange, post]);

  useEffect(() => {
    const { startIndex, endIndex } = thumbnailsVisibleRange;
    let index = startIndex;
    for (; index <= endIndex; index++) {
      post(MessageOp.Render, { index, kind: RenderKind.Thumbnail });
    }
  }, [thumbnailsVisibleRange, post]);

  useEffect(() => {
    workerRef.current = new Worker(
      /* webpackChunkName: "pdf.worker" */ new URL(
        './worker/worker.ts',
        import.meta.url
      )
    );

    async function process({ data }: MessageEvent<MessageData>) {
      const { type, state } = data;

      if (type === MessageOp.Init) {
        setState(
          state === MessageState.Ready ? State.Connected : State.Connecting
        );
        return;
      }
      if (type === MessageOp.Open && state === MessageState.Ready) {
        setState(State.Loaded);
        return;
      }

      if (state === MessageState.Poll) {
        return;
      }

      switch (type) {
        case MessageOp.SyncDocInfo: {
          const updated = data[type];
          setDocInfo(info => ({ ...info, ...updated }));
          setState(State.Synced);
          break;
        }
        case MessageOp.Rendered: {
          const { index, kind, imageBitmap } = data[type];
          render(index, kind, imageBitmap);
          break;
        }
      }
    }

    workerRef.current.addEventListener('message', event => {
      process(event).catch(console.error);
    });

    return () => {
      workerRef.current?.terminate();
    };
  }, [model, post, render]);

  useEffect(() => {
    if (!model.sourceId) return;

    if (state === State.Connected) {
      getAttachmentBlob(model)
        .then(blob => {
          if (!blob) return;
          setState(State.Loading);
          post(MessageOp.Open, { blob });
        })
        .catch(console.error);
      return;
    }

    if (state === State.Loaded) {
      setState(State.Syncing);
      post(MessageOp.SyncDocInfo);
      return;
    }
  }, [state, post, model, docInfo]);

  const pageContent = useCallback(
    (index: number) => {
      return (
        <Page
          key={index}
          index={index}
          className={styles.viewerPage}
          width={docInfo.width}
          height={docInfo.height}
        />
      );
    },
    [docInfo]
  );

  const thumbnailContent = useCallback(
    (index: number) => {
      return (
        <Thumbnail
          key={index}
          index={index}
          className={clsx([
            styles.thumbnailsPage,
            { selected: index === docInfo.cursor },
          ])}
          width={THUMBNAIL_WIDTH}
          height={Math.ceil((docInfo.height / docInfo.width) * THUMBNAIL_WIDTH)}
          onSelect={onSelect}
        />
      );
    },
    [docInfo, onSelect]
  );

  const mainComponents = useMemo(() => {
    return {
      Header: () => <div style={{ width: '100%', height: '20px' }} />,
      Footer: () => <div style={{ width: '100%', height: '20px' }} />,
      Item: (props: ItemProps) => (
        <Item className={styles.mainItemWrapper} {...props} />
      ),
      Scroller,
    };
  }, []);

  const thumbnailsComponents = useMemo(() => {
    return {
      Item: (props: ItemProps) => (
        <Item className={styles.thumbnailsItemWrapper} {...props} />
      ),
      Scroller,
    };
  }, []);

  return (
    <div
      className={clsx([
        styles.body,
        {
          gridding: true,
          scrollable: true,
        },
      ])}
      ref={viewerRef}
    >
      <Virtuoso<null, ItemProps['context']>
        onScroll={onScroll}
        ref={scrollerHandleRef}
        scrollerRef={scroller => {
          if (scrollerRef.current) return;
          scrollerRef.current = scroller as HTMLElement;
        }}
        className={styles.virtuoso}
        rangeChanged={updateMainVisibleRange}
        increaseViewportBy={{
          top: (docInfo.height + 20) * Math.min(5, docInfo.total),
          bottom: (docInfo.height + 20) * Math.min(5, docInfo.total),
        }}
        totalCount={docInfo.total}
        itemContent={pageContent}
        components={mainComponents}
      />
      <div className={styles.thumbnails}>
        {collapsed ? null : (
          <div className={clsx([styles.thumbnailsPages, { collapsed }])}>
            <Virtuoso<null, ItemProps['context']>
              style={{
                height:
                  Math.min(3, docInfo.total) *
                  (docInfo.height / docInfo.width) *
                  THUMBNAIL_WIDTH,
              }}
              ref={thumbnailsScrollerHandleRef}
              scrollerRef={scroller => {
                if (thumbnailsScrollerRef.current) return;
                thumbnailsScrollerRef.current = scroller as HTMLElement;
              }}
              rangeChanged={updateThumbnailsVisibleRange}
              className={styles.virtuoso}
              totalCount={docInfo.total}
              itemContent={thumbnailContent}
              components={thumbnailsComponents}
            />
          </div>
        )}
        <div className={styles.thumbnailsIndicator}>
          <div>
            <span>{docInfo.cursor + 1}</span>/<span>{docInfo.total}</span>
          </div>
          <IconButton
            icon={collapsed ? <CollapseIcon /> : <ExpandIcon />}
            onClick={() => setCollapsed(state => !state)}
          />
        </div>
      </div>
    </div>
  );
};
