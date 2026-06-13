"use client";

// Video grid. Renders camera + screen-share tracks (with placeholders for
// participants who have their camera off) through the SFU-subscribed tracks.
import { GridLayout, ParticipantTile, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";

export function Stage() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  return (
    <div className="h-full w-full">
      <GridLayout tracks={tracks} className="h-full">
        <ParticipantTile className="rounded-2xl overflow-hidden" />
      </GridLayout>
    </div>
  );
}
