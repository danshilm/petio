import React from "react";
import { withRouter, Link } from "react-router-dom";
import { connect } from "react-redux";
import Api from "../data/Api";

import MovieShowTop from "../components/MovieShowTop";
import { ReactComponent as Spinner } from "../assets/svg/spinner.svg";
import User from "../data/User";
import Review from "../components/Review";
import { ReactComponent as BackIcon } from "../assets/svg/back.svg";

class Season extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      onServer: false,
      show: this.props.match.params.id,
      season: this.props.match.params.season,
      requested: false,
    };

    this.daysTillAir = this.daysTillAir.bind(this);
    this.getReviews = this.getReviews.bind(this);
    this.request = this.request.bind(this);
    this.getRequests = this.getRequests.bind(this);
  }

  componentDidMount() {
    let page = document.querySelectorAll(".page-wrap")[0];
    page.scrollTop = 0;
    window.scrollTo(0, 0);
    let id = this.props.match.params.id;

    this.getReviews();
    this.getRequests();

    if (!this.props.api.series_lookup[id]) {
      // check for cached
      Api.series(id);
    } else if (this.props.api.series_lookup[id].isMinified) {
      Api.series(id);
    }
  }

  async request() {
    let id = this.props.match.params.id;
    let series = this.props.api.series_lookup[id];
    let requests = this.props.user.requests[id];
    if (requests) {
      if (requests.users.includes(this.props.user.current.id)) {
        this.props.msg({
          message: "Already Requested",
          type: "error",
        });
        return;
      }
    }
    let request = {
      id: series.id,
      tmdb_id: series.id,
      tvdb_id: series.tvdb_id,
      imdb_id: series.imdb_id,
      title: series.name,
      type: "tv",
      thumb: series.poster_path,
    };

    try {
      await User.request(request, this.props.user.current);
      this.props.msg({
        message: `New Request added: ${series.name}`,
        type: "good",
      });
      await User.getRequests();
      this.getRequests();
    } catch (err) {
      this.props.msg({
        message: err,
        type: "error",
      });
    }
  }

  getReviews() {
    let id = this.props.match.params.id;
    User.getReviews(id);
  }

  getRequests() {
    let id = this.props.match.params.id;
    let requests = this.props.user.requests;
    if (!requests) return;
    if (!requests[id]) {
      if (this.state.requested) {
        this.setState({
          requested: false,
        });
      }
      return;
    }
    let requestUsers = Object.keys(requests[id].users).length;
    if (this.props.user.requests[id] && requestUsers !== this.state.requested) {
      this.setState({
        requested: requestUsers,
      });
    } else if (!requests[id] && this.state.requested) {
      this.setState({
        requested: false,
      });
    }
  }

  daysTillAir(airDate) {
    var oneDay = 24 * 60 * 60 * 1000;
    var secondDate = new Date();
    var firstDate = new Date(airDate);
    let days = Math.round(
      Math.abs(
        (firstDate.setHours(0, 0, 0, 0) - secondDate.setHours(0, 0, 0, 0)) /
          oneDay
      )
    );

    if (firstDate < secondDate) {
      return <span className="aired">Has aired on tv</span>;
    }

    return days < 100 ? (
      <span className="not-aired">
        airs in {days} {days > 1 ? "days" : "day"}
      </span>
    ) : (
      <span className="not-aired">Not yet aired</span>
    );
  }

  render() {
    let id = this.props.match.params.id;
    let season = this.props.match.params.season;
    let seriesData = Object.assign({}, this.props.api.series_lookup[id]);
    let seasonData = this.props.api.series_lookup[id]
      ? this.props.api.series_lookup[id].seasonData[season]
      : false;
    if (seriesData)
      seriesData.poster_path = seasonData
        ? seasonData.poster_path
        : seriesData.poster_path;
    console.log(seasonData);
    let now = new Date();
    now.setHours(0, 0, 0, 0);
    if (!seriesData || !seasonData) {
      return (
        <div className="page-wrap">
          <div className="spinner">
            <Spinner />
          </div>
        </div>
      );
    } else {
      return (
        <div
          className="media-wrap"
          data-id={seriesData.imdb_id}
          key={`${seriesData.title}__wrap`}
        >
          <Review
            id={this.props.match.params.id}
            user={this.props.user.current}
            active={this.state.reviewOpen}
            closeReview={this.closeReview}
            getReviews={this.getReviews}
            item={seriesData}
          />
          <MovieShowTop
            mediaData={seriesData}
            trailer={this.state.trailer}
            requested={this.state.requested}
            request={this.request}
            openIssues={this.props.openIssues}
          />
          <div className="media-content">
            <section>
              <div className="quick-view">
                <div className="side-content">
                  <div className="media-action">
                    <Link to={`/series/${id}`} className="btn btn__square">
                      <BackIcon />
                      Back to {seriesData.name}
                    </Link>
                  </div>
                </div>
                <div className="detail--wrap">
                  <div className="detail--content">
                    <div className="media--actions__mob">
                      <Link to={`/series/${id}`} className="btn btn__square">
                        <BackIcon />
                        Back to {seriesData.name}
                      </Link>
                    </div>
                    <div className="detail--bar">
                      <p>
                        {seasonData.air_date
                          ? new Date(seasonData.air_date).getFullYear()
                          : "Unknown"}
                      </p>
                      <div className="detail--bar--sep">·</div>
                      <p>{seasonData.name}</p>
                    </div>
                    <p className="sub-title mb--1">Overview</p>
                    <p className="overview">
                      {seasonData.overview
                        ? seasonData.overview
                        : seriesData.overview}
                    </p>
                  </div>
                </div>
              </div>
            </section>
            <section>
              <h3 className="sub-title mb--1">{`${seasonData.episodes.length} Episodes`}</h3>
              <div className="season-episodes">
                {seasonData.episodes.map((episode) => {
                  let airDate = episode.air_date
                    ? Date.parse(episode.air_date)
                    : false;
                  return (
                    <div
                      key={`ep__s${episode.season_number}e${episode.episode_number}`}
                      className={
                        "season-episode " +
                        (airDate < now ? "aired" : "not-aired")
                      }
                    >
                      <div className="season-episode--img">
                        <img
                          src={`https://image.tmdb.org/t/p/w500${
                            episode.still_path
                              ? episode.still_path
                              : seriesData.poster_path
                          }`}
                        />
                      </div>
                      <div className="season-episode--info">
                        <p className="upper small ep-num">
                          Season {episode.season_number}: Episode{" "}
                          {episode.episode_number} - {this.daysTillAir(airDate)}
                        </p>
                        <h4 className="sub-title">{episode.name}</h4>
                        <p className="small detail">{episode.overview}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      );
    }
  }
}

Season = withRouter(Season);

function SeasonContainer(props) {
  return (
    <Season
      api={props.api}
      user={props.user}
      openIssues={props.openIssues}
      msg={props.msg}
    />
  );
}

const mapStateToProps = function (state) {
  return {
    api: state.api,
    user: state.user,
  };
};

export default connect(mapStateToProps)(SeasonContainer);
